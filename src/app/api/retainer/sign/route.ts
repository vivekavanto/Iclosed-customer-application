import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";
import { put } from "@vercel/blob";
import { generateRetainerPdf } from "@/lib/generateRetainerPdf";
import { buildRetainerEmailHtml } from "@/lib/email-templates/retainer";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";

type Side = "purchase" | "sale" | null;

interface Slot {
  leadId: string;
  side: Side;
}

const PURCHASE_AND_SALE = "Purchase & Sale";

/**
 * POST /api/retainer/sign
 *
 * Saves a retainer signature for the authenticated user's next-unsigned lead.
 *
 * "Purchase & Sale" leads sign ONE combined retainer (side=null) whose PDF
 * lists both the purchase and sale property addresses. Legacy P&S leads with
 * both side-specific signatures already on file are treated as fully signed.
 *
 * Body: { full_name: string, signature: string, signed_date?: string }
 */
export async function POST(req: Request) {
  try {
    const client = await getAuthClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { full_name, signature } = body;
    const signedDate = new Date().toISOString().split("T")[0];

    if (!full_name || !signature) {
      return NextResponse.json(
        { success: false, error: "full_name and signature are required" },
        { status: 400 }
      );
    }

    const { data: deals } = await supabaseAdmin
      .from("deals")
      .select("lead_id")
      .eq("client_id", client.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    const leadIds = (deals || []).map((d) => d.lead_id).filter(Boolean);

    if (leadIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "No leads found for this account" },
        { status: 404 }
      );
    }

    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select(
        "id, first_name, last_name, email, lead_type, address_street, address_city, address_province, address_postal_code, selling_address_street, selling_address_city, selling_address_province, selling_address_postal_code"
      )
      .in("id", leadIds);

    const leadById = new Map((leads || []).map((l) => [l.id, l]));

    // One slot per lead — P&S retainers are now combined.
    const slots: Slot[] = leadIds.map((id) => ({ leadId: id, side: null }));

    const { data: signatures } = await supabaseAdmin
      .from("retainer_signatures")
      .select("lead_id, side")
      .in("lead_id", leadIds);

    const signedKey = (leadId: string, side: Side) => `${leadId}::${side ?? ""}`;
    const signedSet = new Set(
      (signatures || []).map((s) => signedKey(s.lead_id, (s.side ?? null) as Side))
    );

    const isLeadSigned = (leadId: string, leadType: string): boolean => {
      if (signedSet.has(signedKey(leadId, null))) return true;
      if (leadType === PURCHASE_AND_SALE) {
        return (
          signedSet.has(signedKey(leadId, "purchase")) &&
          signedSet.has(signedKey(leadId, "sale"))
        );
      }
      return false;
    };

    const nextSlot = slots.find((s) => {
      const lead = leadById.get(s.leadId);
      return !isLeadSigned(s.leadId, lead?.lead_type ?? "");
    });

    if (!nextSlot) {
      return NextResponse.json({
        success: true,
        message: "All retainers already signed",
        already_signed: true,
      });
    }

    const { leadId, side } = nextSlot;
    const lead = leadById.get(leadId);

    if (lead) {
      const intakeName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`
        .trim()
        .toLowerCase();
      const signatureValue = signature.trim().toLowerCase();

      if (intakeName && signatureValue !== intakeName) {
        return NextResponse.json(
          {
            success: false,
            error: "Signature must match the name you provided in the intake form",
          },
          { status: 400 }
        );
      }
    }

    const { error } = await supabaseAdmin
      .from("retainer_signatures")
      .insert({
        lead_id: leadId,
        full_name,
        signature,
        signed_date: signedDate,
        side,
      });

    if (error) {
      console.error("[Retainer Sign] Insert error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // ── Build address(es) for PDF + email ──
    const purchaseAddress = lead
      ? [
          lead.address_street,
          lead.address_city,
          lead.address_province,
          lead.address_postal_code,
        ]
          .filter(Boolean)
          .join(", ")
      : "";

    const saleAddress = lead
      ? [
          lead.selling_address_street,
          lead.selling_address_city,
          lead.selling_address_province,
          lead.selling_address_postal_code,
        ]
          .filter(Boolean)
          .join(", ")
      : "";

    const isPS = lead?.lead_type === PURCHASE_AND_SALE;

    // For non-P&S leads, propertyAddress is the single relevant address.
    // For P&S leads we still pass a combined string for templates/logs that
    // reference a single `propertyAddress`, but the PDF + email also receive
    // the structured purchase/sale addresses so each can be rendered with its
    // own label.
    const propertyAddress = isPS
      ? [purchaseAddress, saleAddress].filter(Boolean).join(" / ")
      : purchaseAddress;

    // PDF generation, blob upload, doc-row insert, and post-sign email all
    // run synchronously BEFORE we return the response. This used to live in a
    // fire-and-forget `(async () => {...})()` IIFE, which on Vercel's
    // serverless runtime gets killed the moment NextResponse returns — so
    // none of the work below ever completed in production. Every signature
    // row was being written (sync, before response) but no PDF was ever
    // persisted to lead_corporate_docs.
    //
    // The trade-off is that the client now waits ~2-3s extra at sign time
    // for PDF generation + blob upload + email dispatch. That's acceptable
    // for a one-time sign action; the alternative — silently losing the PDF
    // for every customer — is the bug we're fixing.
    //
    // Errors inside this block are logged but do NOT fail the response: the
    // signature row is already saved, so the user's signing action is durable.
    // The PDF can be regenerated separately if it fails here.
    try {
      // 0. Generate unique ID (IC-YYYYMMDD-XXXX) — global sequential counter
      const dateKey = signedDate.replace(/-/g, ""); // YYYYMMDD
      const { count } = await supabaseAdmin
        .from("retainer_signatures")
        .select("id", { count: "exact", head: true });
      const seq = String(count ?? 1).padStart(4, "0");
      const uniqueId = `IC-${dateKey}-${seq}`;

      // 1. Generate PDF (P&S receives both addresses; single-side leads
      //    are unchanged and just receive propertyAddress)
      const pdfBytes = await generateRetainerPdf({
        fullName: full_name,
        signature,
        signedDate,
        propertyAddress,
        leadType: lead?.lead_type ?? "",
        uniqueId,
        side,
        purchaseAddress: isPS ? purchaseAddress : undefined,
        saleAddress: isPS ? saleAddress : undefined,
      });

      // 2. Upload to Vercel Blob (combined PDF for P&S uses "main" segment)
      const sideSegment = side ?? "main";
      const blob = await put(
        `corporate-docs/${leadId}/${sideSegment}/${Date.now()}-retainer-agreement.pdf`,
        Buffer.from(pdfBytes),
        { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN! }
      );

      // 3. Save to lead_corporate_docs (one row per signed retainer).
      //    `is_identification: false` mirrors what the other inserters into
      //    this table pass (uploadblobstorage, save-aps-metadata) — if the
      //    column is NOT NULL in the schema, omitting it silently fails the
      //    insert and the PDF row never appears.
      //    Errors here MUST be checked: an un-checked insert error is the
      //    reason no retainer PDFs were appearing in the table even though
      //    blob upload succeeded.
      const { error: docInsertErr } = await supabaseAdmin
        .from("lead_corporate_docs")
        .insert({
          lead_id: leadId,
          doc_type: "retainer_agreement",
          file_name:
            side === "sale"
              ? "retainer-agreement-sale.pdf"
              : side === "purchase"
                ? "retainer-agreement-purchase.pdf"
                : "retainer-agreement.pdf",
          file_url: blob.url,
          is_identification: false,
        });

      if (docInsertErr) {
        throw new Error(
          `lead_corporate_docs insert failed: ${docInsertErr.message}`,
        );
      }

      console.log("[Retainer Sign] PDF row inserted in lead_corporate_docs:", {
        leadId,
        side: side ?? "main",
        url: blob.url,
      });

      // 4. Email PDF to client
      if (lead?.email) {
        const { html, subject } = await buildRetainerEmailHtml({
          firstName: lead.first_name ?? "",
          propertyAddress,
          leadType: lead.lead_type ?? "",
          side,
          purchaseAddress: isPS ? purchaseAddress : undefined,
          saleAddress: isPS ? saleAddress : undefined,
        });

        await resend.emails.send({
          from: EMAIL_FROM,
          replyTo: EMAIL_REPLY_TO,
          to: lead.email,
          subject,
          html,
          attachments: [
            {
              filename:
                side === "sale"
                  ? "retainer-agreement-sale.pdf"
                  : side === "purchase"
                    ? "retainer-agreement-purchase.pdf"
                    : "retainer-agreement.pdf",
              content: Buffer.from(pdfBytes),
            },
          ],
        });

        console.log("[Retainer Sign] PDF emailed to:", lead.email);
      }

      console.log(
        "[Retainer Sign] PDF saved for lead:",
        leadId,
        "side:",
        side ?? "main"
      );
    } catch (pdfErr) {
      console.error("[Retainer Sign] PDF/email error:", pdfErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Retainer Sign] Server error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
