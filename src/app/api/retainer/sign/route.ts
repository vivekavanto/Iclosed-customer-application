import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";
import { put } from "@vercel/blob";
import { generateRetainerPdf } from "@/lib/generateRetainerPdf";
import { buildRetainerEmailHtml } from "@/lib/email-templates/retainer";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";

/**
 * POST /api/retainer/sign
 *
 * Saves a retainer signature for the authenticated user's lead.
 * Body: { full_name: string, signature: string, signed_date: string }
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
    const { full_name, signature, signed_date } = body;

    if (!full_name || !signature || !signed_date) {
      return NextResponse.json(
        { success: false, error: "full_name, signature, and signed_date are required" },
        { status: 400 }
      );
    }

    // Find the user's lead(s) via deals
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

    // Find the first unsigned deal
    const { data: signatures } = await supabaseAdmin
      .from("retainer_signatures")
      .select("lead_id")
      .in("lead_id", leadIds);

    const signedLeadIds = new Set((signatures || []).map((s) => s.lead_id));
    const unsignedLeadId = leadIds.find((id) => !signedLeadIds.has(id));

    if (!unsignedLeadId) {
      return NextResponse.json({
        success: true,
        message: "All retainers already signed",
        already_signed: true,
      });
    }

    const leadId = unsignedLeadId;

    // Fetch the lead to validate name match and get details for PDF/email
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("first_name, last_name, email, lead_type, address_street, address_city, address_province, address_postal_code")
      .eq("id", leadId)
      .single();

    if (lead) {
      const intakeName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim().toLowerCase();
      const signatureValue = signature.trim().toLowerCase();

      if (intakeName && signatureValue !== intakeName) {
        return NextResponse.json(
          { success: false, error: "Signature must match the name you provided in the intake form" },
          { status: 400 }
        );
      }
    }

    // Check if already signed for this lead
    const { data: existing } = await supabaseAdmin
      .from("retainer_signatures")
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        message: "Retainer already signed",
        already_signed: true,
      });
    }

    // Insert the signature
    const { error } = await supabaseAdmin
      .from("retainer_signatures")
      .insert({
        lead_id: leadId,
        full_name,
        signature,
        signed_date,
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
      ? [lead.address_street, lead.address_city, lead.address_province, lead.address_postal_code]
          .filter(Boolean)
          .join(", ")
      : "";

    (async () => {
      try {
        // 1. Generate PDF
        const pdfBytes = await generateRetainerPdf({
          fullName: full_name,
          signature,
          signedDate: signed_date,
          propertyAddress,
          leadType: lead?.lead_type ?? "",
        });

        // 2. Upload to Vercel Blob
        const blob = await put(
          `corporate-docs/${leadId}/${Date.now()}-retainer-agreement.pdf`,
          Buffer.from(pdfBytes),
          { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN! }
        );

        // 3. Save to lead_corporate_docs
        await supabaseAdmin.from("lead_corporate_docs").insert({
          lead_id: leadId,
          doc_type: "retainer_agreement",
          file_name: "retainer-agreement.pdf",
          file_url: blob.url,
        });

        // 4. Email PDF to client
        if (lead?.email) {
          const { html, subject } = buildRetainerEmailHtml({
            firstName: lead.first_name ?? "",
            propertyAddress,
            leadType: lead.lead_type ?? "",
          });

          await resend.emails.send({
            from: EMAIL_FROM,
            replyTo: EMAIL_REPLY_TO,
            to: lead.email,
            subject,
            html,
            attachments: [
              {
                filename: "retainer-agreement.pdf",
                content: Buffer.from(pdfBytes),
              },
            ],
          });

          console.log("[Retainer Sign] PDF emailed to:", lead.email);
        }

        console.log("[Retainer Sign] PDF saved for lead:", leadId);
      } catch (pdfErr) {
        console.error("[Retainer Sign] PDF/email error:", pdfErr);
      }
    })();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Retainer Sign] Server error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
