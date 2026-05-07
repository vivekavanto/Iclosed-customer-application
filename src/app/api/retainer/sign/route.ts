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
 * Saves a retainer signature for the authenticated user's next-unsigned slot.
 * For "Purchase & Sale" leads each lead expands into two slots (purchase +
 * sale) and the next unsigned side is determined server-side — clients
 * cannot pick which side they're signing.
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

    const slots: Slot[] = [];
    for (const id of leadIds) {
      const lead = leadById.get(id);
      if (lead?.lead_type === PURCHASE_AND_SALE) {
        slots.push({ leadId: id, side: "purchase" });
        slots.push({ leadId: id, side: "sale" });
      } else {
        slots.push({ leadId: id, side: null });
      }
    }

    const { data: signatures } = await supabaseAdmin
      .from("retainer_signatures")
      .select("lead_id, side")
      .in("lead_id", leadIds);

    const signedKey = (leadId: string, side: Side) => `${leadId}::${side ?? ""}`;
    const signedSet = new Set(
      (signatures || []).map((s) => signedKey(s.lead_id, (s.side ?? null) as Side))
    );

    const nextSlot = slots.find(
      (s) => !signedSet.has(signedKey(s.leadId, s.side))
    );

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

    // ── Generate PDF, upload, and email (non-blocking) ──
    const propertyAddress = lead
      ? (side === "sale"
          ? [
              lead.selling_address_street,
              lead.selling_address_city,
              lead.selling_address_province,
              lead.selling_address_postal_code,
            ]
          : [
              lead.address_street,
              lead.address_city,
              lead.address_province,
              lead.address_postal_code,
            ]
        )
          .filter(Boolean)
          .join(", ")
      : "";

    (async () => {
      try {
        // 0. Generate unique ID (IC-YYYYMMDD-XXXX) — global sequential counter
        const dateKey = signedDate.replace(/-/g, ""); // YYYYMMDD
        const { count } = await supabaseAdmin
          .from("retainer_signatures")
          .select("id", { count: "exact", head: true });
        const seq = String(count ?? 1).padStart(4, "0");
        const uniqueId = `IC-${dateKey}-${seq}`;

        // 1. Generate PDF
        const pdfBytes = await generateRetainerPdf({
          fullName: full_name,
          signature,
          signedDate,
          propertyAddress,
          leadType: lead?.lead_type ?? "",
          uniqueId,
          side,
        });

        // 2. Upload to Vercel Blob (tag path with side for clarity)
        const sideSegment = side ?? "main";
        const blob = await put(
          `corporate-docs/${leadId}/${sideSegment}/${Date.now()}-retainer-agreement.pdf`,
          Buffer.from(pdfBytes),
          { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN! }
        );

        // 3. Save to lead_corporate_docs
        await supabaseAdmin.from("lead_corporate_docs").insert({
          lead_id: leadId,
          doc_type: "retainer_agreement",
          file_name:
            side === "sale"
              ? "retainer-agreement-sale.pdf"
              : side === "purchase"
                ? "retainer-agreement-purchase.pdf"
                : "retainer-agreement.pdf",
          file_url: blob.url,
        });

        // 4. Email PDF to client
        if (lead?.email) {
          const { html, subject } = buildRetainerEmailHtml({
            firstName: lead.first_name ?? "",
            propertyAddress,
            leadType: lead.lead_type ?? "",
            side,
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
    })();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Retainer Sign] Server error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
