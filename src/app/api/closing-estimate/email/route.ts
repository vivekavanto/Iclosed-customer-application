import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeals } from "@/lib/getAuthClient";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";
import { readStatementTypeOption, resolveClientRates } from "@/lib/closingCostRates";
import { computeStatement, type ClosingCostInputs } from "@/lib/closingCosts";
import { applyAdjustments } from "@/lib/closingCostAdjustments";
import { generateClosingCostPdf } from "@/lib/closingCostPdf";
import {
  estimateEmailHtml,
  estimateEmailSubject,
  estimatePdfFileName,
} from "@/lib/closingEstimateEmail";

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
// The server RECOMPUTES the statement from the raw inputs; a client-sent total
// is never trusted, and never even read.

export const dynamic = "force-dynamic";

const MAX_AMOUNT = 1_000_000_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// money() and esc() now live in src/lib/closingEstimateEmail.ts, alongside the
// body they format — the preview needs them too.

function amount(raw: unknown, label: string): number | { error: string } {
  const value = raw === null || raw === undefined || raw === "" ? 0 : Number(raw);
  if (!Number.isFinite(value)) return { error: `${label} must be a number` };
  if (value < 0) return { error: `${label} cannot be negative` };
  if (value > MAX_AMOUNT) return { error: `${label} is unrealistically large` };
  return value;
}

export async function POST(req: Request) {
  const auth = await getAuthClientDeals();
  if (!auth?.client) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }

  // The client may send it to themselves at a different address, but never to
  // an arbitrary third party in bulk — one recipient, and it is rate-limited by
  // the fact that it is behind a session.
  const to = String(body.to ?? auth.client.email ?? "").trim();
  if (!EMAIL_RE.test(to)) {
    return NextResponse.json(
      { success: false, error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const price = amount(body.purchase_price, "Purchase price");
  if (typeof price !== "number") {
    return NextResponse.json({ success: false, error: price.error }, { status: 400 });
  }
  const deposit = amount(body.deposit_paid, "Deposit");
  if (typeof deposit !== "number") {
    return NextResponse.json({ success: false, error: deposit.error }, { status: 400 });
  }
  const mortgage = amount(body.mortgage_amount, "Mortgage amount");
  if (typeof mortgage !== "number") {
    return NextResponse.json({ success: false, error: mortgage.error }, { status: 400 });
  }
  if (price <= 0) {
    return NextResponse.json(
      { success: false, error: "Enter a purchase price first." },
      { status: 400 },
    );
  }

  // Same rate schedule the page calculated with. An explicitly chosen firm
  // wins; otherwise the issued estimate's frozen snapshot, so the client's
  // what-if numbers build on the fees they were actually quoted.
  const requestedFirm =
    typeof body.firm_key === "string" && body.firm_key ? body.firm_key : null;

  const dealIds = (auth.deals ?? []).map((d) => d.id);
  let issuedRatesUsed: unknown = null;
  let firmKey: string | null = requestedFirm;
  if (dealIds.length > 0 && !requestedFirm) {
    const { data: rows } = await supabaseAdmin
      .from("deal_closing_estimates")
      .select("rates_used, firm_key")
      .in("deal_id", dealIds)
      .eq("status", "issued")
      .eq("is_deleted", false)
      .order("issued_at", { ascending: false })
      .limit(1);
    issuedRatesUsed = rows?.[0]?.rates_used ?? null;
    firmKey = rows?.[0]?.firm_key ?? null;
  }

  const { rates: baseRates } = await resolveClientRates(issuedRatesUsed, firmKey);
  const rates = applyAdjustments(baseRates, body.adjustments);

  const optional = (raw: unknown, allowNegative = false): number | null => {
    if (raw === null || raw === undefined || raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || Math.abs(n) > MAX_AMOUNT) return null;
    if (!allowNegative && n < 0) return null;
    return n;
  };

  const inputs: ClosingCostInputs = {
    price,
    deposit,
    mortgage,
    isToronto: body.is_toronto === true,
    isFirstTimeBuyer: body.is_first_time_buyer === true,
    titlePremiumOverride: optional(body.title_premium_override),
    propertyTaxAdjustment: optional(body.property_tax_adjustment, true),
  };
  const statement = computeStatement(inputs, rates);

  // ── The attachment ──
  // Same generator, same inputs and the same statement type as the on-screen
  // preview, so the PDF in the client's inbox can never disagree with what they
  // were looking at when they hit send.
  const statementType = await readStatementTypeOption(body.statement_type);

  let config: Record<string, unknown> = {};
  if (firmKey) {
    const { data } = await supabaseAdmin
      .from("closing_cost_config")
      .select("*")
      .eq("firm_key", firmKey)
      .eq("is_deleted", false)
      .maybeSingle();
    config = (data as Record<string, unknown>) ?? {};
  }

  const str = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max) || null;
  const fileNo = str(body.file_no_display, 60);

  let attachment: { filename: string; content: Buffer } | null = null;
  try {
    const bytes = await generateClosingCostPdf({
      statement,
      config,
      statementType,
      fileNo,
      propertyAddress: str(body.property_address),
      clientName:
        str(body.purchasers, 200) ??
        `${auth.client.first_name ?? ""} ${auth.client.last_name ?? ""}`.trim() ??
        null,
      closingDate: str(body.closing_date, 40),
      preparedOn: new Date().toISOString().slice(0, 10),
      // A client's own copy is always a planning estimate, whatever wording they
      // previewed — so it always carries the draft watermark.
      draft: true,
    });
    attachment = {
      filename: estimatePdfFileName({
        fileNo,
        propertyAddress: str(body.property_address),
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
    firstName: auth.client.first_name ?? null,
    propertyAddress: str(body.property_address),
    fileNo,
    price,
    totalClosingCosts: statement.total,
    balanceDue: statement.balance.balanceDue,
    hasAttachment: Boolean(attachment),
  });

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: [to],
      subject: estimateEmailSubject(fileNo),
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
      actor_email: auth.client.email ?? null,
      resource_type: "clients",
      resource_id: auth.client.id,
      metadata: {
        to,
        purchase_price: price,
        deposit_paid: deposit,
        mortgage_amount: mortgage,
        is_toronto: inputs.isToronto,
        is_first_time_buyer: inputs.isFirstTimeBuyer,
        balance_due: statement.balance.balanceDue,
        statement_type: statementType.type_key,
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
