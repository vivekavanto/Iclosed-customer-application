import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";
import { resolveRetainerLeadId } from "@/lib/retainerToken";
import { put } from "@vercel/blob";
import { generateRetainerPdf } from "@/lib/generateRetainerPdf";
import { BLOB_ACCESS } from "@/lib/blobPrivacy";
import { buildRetainerEmailHtml } from "@/lib/email-templates/retainer";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";
import { formatLeadTypeLabelForRecipient } from "@/lib/leadEmailAddress";
import { leadHasAccount } from "@/lib/leadHasAccount";

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
    const body = await req.json();
    const { full_name, signature, token } = body;
    const signedDate = new Date().toISOString().split("T")[0];

    if (!full_name || !signature) {
      return NextResponse.json(
        { success: false, error: "full_name and signature are required" },
        { status: 400 }
      );
    }

    // Two ways to identify the signer (mirrors /api/retainer/check):
    //   • token → account-free retainer link, maps to exactly one lead.
    //   • else  → the logged-in client signs their next-unsigned lead.
    let leadIds: string[] = [];

    if (token) {
      const leadId = await resolveRetainerLeadId(token);
      if (!leadId) {
        return NextResponse.json(
          { success: false, error: "This retainer link is invalid or has expired." },
          { status: 401 }
        );
      }
      leadIds = [leadId];
    } else {
      const client = await getAuthClient();
      if (!client) {
        return NextResponse.json(
          { success: false, error: "Not authenticated" },
          { status: 401 }
        );
      }

      const { data: deals } = await supabaseAdmin
        .from("deals")
        .select("lead_id, status")
        .eq("client_id", client.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      // Mirror /api/retainer/check EXACTLY: only CONVERTED deals require a
      // retainer. Intake auto-linked deals sit at "Pending" and must be excluded
      // here too — otherwise the two endpoints disagree on which lead is "next to
      // sign" and a signature could be misattributed to a not-yet-converted deal.
      const NON_CONVERTED_DEAL_STATUSES = new Set(["Pending"]);
      leadIds = (deals || [])
        .filter((d) => !NON_CONVERTED_DEAL_STATUSES.has(d.status))
        .map((d) => d.lead_id)
        .filter(Boolean);

      if (leadIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "No converted deals found for this account" },
          { status: 404 }
        );
      }
    }

    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select(
        "id, first_name, last_name, email, lead_type, address_street, address_city, address_province, address_postal_code, selling_address_street, selling_address_city, selling_address_province, selling_address_postal_code, parent_lead_id, co_person_role, client_id"
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
    const coRole = (lead?.co_person_role as "purchaser" | "seller" | null) ?? null;
    // A lead is a co-person if it is linked under a primary (parent_lead_id) OR
    // carries an explicit co_person_role. Checking both is defensive: the two
    // are set together at intake, but some linking paths set only one — and a
    // co-person must never be mistaken for a primary.
    const isCoPerson = Boolean(lead?.parent_lead_id) || coRole != null;

    // The "Want to help with your co-purchaser(s) paperwork?" popup is shown
    // ONLY to a primary signer (no parent, no co-role) who actually has at
    // least one co-person lead linked to them. The client uses this flag to
    // decide whether to render the popup before the account-creation prompt.
    let showCoPersonPrompt = false;
    let coPersons: Array<{
      lead_id: string;
      first_name: string;
      last_name: string;
      co_person_role: string | null;
    }> = [];
    if (!isCoPerson) {
      const { data: coRows } = await supabaseAdmin
        .from("leads")
        .select("id, first_name, last_name, co_person_role")
        .eq("parent_lead_id", leadId);
      coPersons = (coRows ?? []).map((c) => ({
        lead_id: c.id,
        first_name: c.first_name ?? "",
        last_name: c.last_name ?? "",
        co_person_role: (c.co_person_role as string | null) ?? null,
      }));
      showCoPersonPrompt = coPersons.length > 0;
    }

    // Mirror /api/retainer/check: a P&S deal is two independent transactions for
    // its co-persons. A co-purchaser retains us only for the PURCHASE side, a
    // co-seller only for the SALE side — so their PDF/email must show only that
    // side's property. The primary client retains and sees both sides.
    const coPurchaserOnly = isPS && isCoPerson && coRole === "purchaser";
    const coSellerOnly = isPS && isCoPerson && coRole === "seller";
    const showCombined = isPS && !coPurchaserOnly && !coSellerOnly;

    // The signature row keeps `side` = null (combined-signature detection in
    // isLeadSigned relies on it); `displaySide` only drives PDF/email labelling
    // and the document file name for single-side co-persons.
    const displaySide: Side = coPurchaserOnly
      ? "purchase"
      : coSellerOnly
        ? "sale"
        : side;

    // For non-P&S leads, propertyAddress is the single relevant address.
    // For combined P&S we pass a joined string for templates/logs that
    // reference a single `propertyAddress`, but the PDF + email also receive
    // the structured purchase/sale addresses so each can be rendered with its
    // own label. Single-side co-persons get only their own side's address.
    const propertyAddress = showCombined
      ? [purchaseAddress, saleAddress].filter(Boolean).join(" / ")
      : coSellerOnly
        ? saleAddress
        : purchaseAddress;
    const displayLeadType = formatLeadTypeLabelForRecipient(lead);

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
        leadType: displayLeadType,
        uniqueId,
        side: displaySide,
        purchaseAddress: showCombined ? purchaseAddress : undefined,
        saleAddress: showCombined ? saleAddress : undefined,
      });

      // 2. Upload to Vercel Blob (combined PDF for P&S uses "main" segment)
      const sideSegment = displaySide ?? "main";
      const blob = await put(
        `corporate-docs/${leadId}/${sideSegment}/${Date.now()}-retainer-agreement.pdf`,
        Buffer.from(pdfBytes),
        { access: BLOB_ACCESS, token: process.env.BLOB_READ_WRITE_TOKEN! }
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
            displaySide === "sale"
              ? "retainer-agreement-sale.pdf"
              : displaySide === "purchase"
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
          leadType: displayLeadType,
          side: displaySide,
          purchaseAddress: showCombined ? purchaseAddress : undefined,
          saleAddress: showCombined ? saleAddress : undefined,
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
                displaySide === "sale"
                  ? "retainer-agreement-sale.pdf"
                  : displaySide === "purchase"
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

    // Whether the signer already has a portal account. The "Activate your
    // account" popup is for NEW clients only — existing clients just log in.
    const accountExists = await leadHasAccount(lead);

    // ── Document-upload responsibility (drives the post-sign "you're set up to
    // manage documents" screen). The choice is made at intake and stored on the
    // PRIMARY lead's `upload_mode`:
    //   "me"   → the primary uploads for the whole family.
    //   "co"   → one designated co-person (upload_consent_uploader_lead_id) does.
    //   "both" → everyone uploads their own (anyone can act for anyone).
    // `isDocumentUploader` = this signer has upload responsibility in the portal.
    // `managedNames` = the OTHER people an uploader uploads for; only populated
    // for the delegated modes ("me"/"co") — in "both" each handles their own.
    // `uploaderName` = the person handling uploads on a SECONDARY signer's
    // behalf (the "someone else is handling it" screen). ──
    const primaryLeadId = isCoPerson ? (lead?.parent_lead_id ?? null) : leadId;
    let uploadMode: "me" | "co" | "both" | null = null;
    let isDocumentUploader = false;
    let managedNames: string[] = [];
    let uploaderName: string | null = null;
    if (primaryLeadId) {
      const { data: primaryRow } = await supabaseAdmin
        .from("leads")
        .select("id, upload_mode, upload_consent_uploader_lead_id")
        .eq("id", primaryLeadId)
        .maybeSingle();
      uploadMode =
        (primaryRow?.upload_mode as "me" | "co" | "both" | null) ?? null;
      const consentUploaderId =
        (primaryRow?.upload_consent_uploader_lead_id as string | null) ?? null;
      if (uploadMode === "both") {
        isDocumentUploader = true;
      } else if (uploadMode === "me" || uploadMode === "co") {
        const resolvedUploaderId =
          uploadMode === "co" ? consentUploaderId : primaryLeadId;
        isDocumentUploader = resolvedUploaderId === leadId;
        if (isDocumentUploader) {
          const { data: familyRows } = await supabaseAdmin
            .from("leads")
            .select("id, first_name, last_name")
            .or(`id.eq.${primaryLeadId},parent_lead_id.eq.${primaryLeadId}`);
          managedNames = (familyRows ?? [])
            .filter((m) => m.id !== leadId)
            .map((m) => `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim())
            .filter(Boolean);
        } else if (resolvedUploaderId) {
          // Secondary signer — name the person handling their documents.
          const { data: uploaderRow } = await supabaseAdmin
            .from("leads")
            .select("first_name, last_name")
            .eq("id", resolvedUploaderId)
            .maybeSingle();
          uploaderName =
            `${uploaderRow?.first_name ?? ""} ${uploaderRow?.last_name ?? ""}`.trim() ||
            null;
        }
      }
    }

    return NextResponse.json({
      success: true,
      show_co_person_prompt: showCoPersonPrompt,
      account_exists: accountExists,
      // The primary's own lead id (the "Me" uploader) and the co-persons the
      // primary may delegate uploads to. Only populated when the popup is shown.
      primary_lead_id: showCoPersonPrompt ? leadId : null,
      co_persons: coPersons,
      // Post-sign "you're set up to manage documents" screen.
      upload_mode: uploadMode,
      uploader_name: uploaderName,
      is_document_uploader: isDocumentUploader,
      managed_names: managedNames,
    });
  } catch (err) {
    console.error("[Retainer Sign] Server error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
