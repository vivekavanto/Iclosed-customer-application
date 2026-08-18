import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";
import { computeStatement, type ClosingCostInputs } from "@/lib/closingCosts";
import { generateClosingCostPdf } from "@/lib/closingCostPdf";
import {
  estimateEmailHtml,
  estimateEmailSubject,
  estimatePdfFileName,
} from "@/lib/closingEstimateEmail";
import {
  parseClientMortgage,
  parseFileId,
  rejectLockedInputs,
  resolveClientEstimateContext,
} from "@/lib/clientEstimateContext";

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

  const inputs: ClosingCostInputs = {
    price: ctx.locked.price,
    deposit: ctx.locked.deposit,
    mortgage,
    isToronto: ctx.locked.isToronto,
    isFirstTimeBuyer: body.is_first_time_buyer === true,
    titlePremiumOverride: ctx.locked.titlePremiumOverride,
    propertyTaxAdjustment: ctx.locked.propertyTaxAdjustment,
    // null → undefined: the firm never said, so each line keeps its default.
    titlePremiumIsEstimate: ctx.locked.titlePremiumIsEstimate ?? undefined,
    teraviewIsEstimate: ctx.locked.teraviewIsEstimate ?? undefined,
    sheriffIsEstimate: ctx.locked.sheriffIsEstimate ?? undefined,
    propertyTaxIsEstimate: ctx.locked.propertyTaxIsEstimate ?? undefined,
  };
  const statement = computeStatement(inputs, ctx.rates);

  // ── The attachment ──
  // Same generator, same inputs and the same statement type as the on-screen
  // preview, so the PDF in the client's inbox can never disagree with what they
  // were looking at when they hit send.
  let attachment: { filename: string; content: Buffer } | null = null;
  try {
    const bytes = await generateClosingCostPdf({
      statement,
      config: ctx.config,
      statementType: ctx.statementType,
      fileNo: ctx.locked.fileNo,
      propertyAddress: ctx.locked.propertyAddress,
      clientName: ctx.locked.purchasers ?? ctx.client.fullName ?? null,
      closingDate: ctx.locked.closingDate,
      preparedOn: new Date().toISOString().slice(0, 10),
      // A client's own copy is always a planning estimate, whatever wording they
      // previewed — so it always carries the draft watermark.
      draft: true,
      configVersion: ctx.configVersion,
    });
    attachment = {
      filename: estimatePdfFileName({
        fileNo: ctx.locked.fileNo,
        propertyAddress: ctx.locked.propertyAddress,
      }),
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
  const html = estimateEmailHtml({
    firstName: ctx.client.firstName,
    propertyAddress: ctx.locked.propertyAddress,
    fileNo: ctx.locked.fileNo,
    price: inputs.price,
    totalClosingCosts: statement.total,
    balanceDue: statement.balance.balanceDue,
    hasAttachment: Boolean(attachment),
  });

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: [to],
      subject: estimateEmailSubject(ctx.locked.fileNo),
      html,
      attachments: attachment ? [attachment] : undefined,
    });
  } catch (err) {
    console.error("[closing-estimate email] send failed:", err);
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
        purchase_price: inputs.price,
        deposit_paid: inputs.deposit,
        mortgage_amount: mortgage,
        is_toronto: inputs.isToronto,
        is_first_time_buyer: inputs.isFirstTimeBuyer,
        balance_due: statement.balance.balanceDue,
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
