import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email/emailTransport";
import { normalizeRecipientEmail } from "@/lib/firmEmail";
import { resolveFirmKey } from "@/lib/firms";
import { estimateEmailHtml, estimateEmailSubject } from "@/lib/closingEstimateEmail";
import { buildPurchaseDraft, draftStatementPdfFileName } from "@/lib/draftStatement";
import { generateDraftStatementPdf } from "@/lib/draftStatementPdf";
import { loadIclosedFees } from "@/lib/loadIclosedFees";
import { draftFileInput } from "@/lib/loadDraftStatement";
import {
  parseClientMortgage,
  parseFileId,
  rejectLockedInputs,
  resolveClientEstimateContext,
} from "@/lib/clientEstimateContext";
// This route can reach the email transport, and the SMTP provider uses
// nodemailer — which needs raw TCP and CANNOT run on the Edge runtime.
// Resend never exposed this because it is an HTTPS fetch client.
export const runtime = "nodejs";

// An SMTP attempt can take ~40s (connect+greeting+socket) and transport allows two.
export const maxDuration = 60;


// POST /api/closing-estimate/email
//
// Emails the client the estimate THEY built with their own numbers.
//
// ── What this is not ────────────────────────────────────────────────────
// This is a self-serve planning estimate, not a statement of account. It is
// deliberately NOT written to `deal_closing_estimates`: nothing a client types
// may enter the firm's records or be mistaken later for a staff-prepared
// figure. The only trace is an `audit_logs` row so staff can see it happened.
//
// The firm's own issued statement is emailed from the admin app and downloaded
// here via /api/closing-estimate/pdf — those paths are untouched by this one.
//
// ── Where it goes ───────────────────────────────────────────────────────
// The address on the client's file, and nowhere else. The caller supplies no
// recipient: this is "email it to me", and accepting a `to` would make an
// authenticated planning tool into a way to send firm-branded attachments from
// the firm's own address to anyone.
//
// The figures are resolved the same way as everywhere else in the portal — the
// mortgage amount and the first-time-buyer flag from the request, everything
// else from the file.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }

  const locked = rejectLockedInputs(body);
  if (locked) {
    return NextResponse.json({ success: false, error: locked }, { status: 400 });
  }

  // Which of the client's own files this is about. Checked against the session's
  // deals by the resolver, so an id that is not theirs is a 404.
  const fileId = parseFileId(body.file_id);
  if (fileId !== null && typeof fileId !== "string") {
    return NextResponse.json(
      { success: false, error: fileId.error },
      { status: 404 },
    );
  }

  const resolved = await resolveClientEstimateContext(fileId);
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error },
      { status: resolved.status },
    );
  }
  const ctx = resolved.context;

  const to = (ctx.emailTo ?? "").trim();
  if (!to) {
    return NextResponse.json(
      {
        success: false,
        error: "There is no email address on your file. Please contact us.",
      },
      { status: 400 },
    );
  }

  const mortgage = parseClientMortgage(body.mortgage_amount);
  if (typeof mortgage !== "number") {
    return NextResponse.json(
      { success: false, error: mortgage.error },
      { status: 400 },
    );
  }

  if (ctx.locked.price <= 0) {
    return NextResponse.json(
      { success: false, error: "We don't have a purchase price on your file yet." },
      { status: 400 },
    );
  }

  const fileInput = await draftFileInput(ctx);
  const isFirstTimeBuyer = body.is_first_time_buyer === true;
  const draft = buildPurchaseDraft(loadIclosedFees(), { ...fileInput, mortgage, firstTimeBuyer: isFirstTimeBuyer });

  // ── The attachment ──
  // Same generator, same inputs and the same statement type as the on-screen
  // preview, so the PDF in the client's inbox can never disagree with what they
  // were looking at when they hit send.
  let attachment: { filename: string; content: Buffer } | null = null;
  try {
    const bytes = await generateDraftStatementPdf({
      draft,
      firmKey: ctx.firmKey,
      preparedOn: new Date().toISOString().slice(0, 10),
    });
    attachment = {
      filename: draftStatementPdfFileName(ctx.locked.fileNo, ctx.locked.propertyAddress),
      content: Buffer.from(bytes),
    };
  } catch (err) {
    // Non-blocking: the summary in the body still carries the balance due,
    // which is the number the client is waiting for.
    console.error("[closing-estimate email] pdf generation failed:", err);
  }

  // Built from the SAME module the client previewed on screen, so the message
  // that lands in their inbox is the one they approved. See
  // src/lib/closingEstimateEmail.ts.
  const firm = resolveFirmKey(ctx.firmKey);
  const html = estimateEmailHtml({
    firmKey: firm,
    firstName: ctx.client.firstName,
    propertyAddress: ctx.locked.propertyAddress,
    fileNo: ctx.locked.fileNo,
    price: fileInput.price,
    totalClosingCosts: draft.closingCostsTotal,
    balanceDue: draft.fundsRequired,
    hasAttachment: Boolean(attachment),
  });

  // The firm on the client's own file — the same one whose letterhead is on the
  // attached PDF and whose name signs off the body.
  //
  // Note this firm comes from the ESTIMATE (deal_closing_estimates.firm_key via
  // closing_cost_config), not from leads.firm_key like every other send in this
  // app. If the two ever disagree, this email is branded differently from the
  // same client's welcome and retainer mail. Left as-is deliberately: the
  // letterhead on the attachment has to match the sender, and the attachment is
  // built from the estimate's own config.
  const sendResult = await sendEmail(
    {
      to: [normalizeRecipientEmail(to)],
      subject: estimateEmailSubject(ctx.locked.fileNo),
      html,
      ...(attachment ? { attachments: [attachment] } : {}),
    },
    { firm, label: "closing-estimate" },
  );

  if (!sendResult.ok) {
    console.error(
      `[closing-estimate email] send failed errorType=${sendResult.errorType}:`,
      sendResult.error,
    );
    return NextResponse.json(
      { success: false, error: "Could not send the email. Please try again." },
      { status: 502 },
    );
  }

  // The only record kept. Best-effort — the client already has the email, so a
  // logging failure must not surface as a send failure and invite a retry.
  try {
    await supabaseAdmin.from("audit_logs").insert({
      action: "closing_estimate.client_self_email",
      actor_email: ctx.client.email ?? null,
      resource_type: "clients",
      resource_id: ctx.client.id,
      metadata: {
        to,
        purchase_price: fileInput.price,
        deposit_paid: fileInput.deposit,
        mortgage_amount: mortgage,
        is_toronto: fileInput.isToronto,
        is_first_time_buyer: isFirstTimeBuyer,
        balance_due: draft.fundsRequired,
        statement_type: ctx.statementType.type_key,
        pdf_attached: Boolean(attachment),
        note: "Client's own planning estimate — not written to deal_closing_estimates",
      },
    });
  } catch (err) {
    console.error("[closing-estimate email] audit insert failed:", err);
  }

  return NextResponse.json({
    success: true,
    sent_to: to,
    pdf_attached: Boolean(attachment),
  });
}
