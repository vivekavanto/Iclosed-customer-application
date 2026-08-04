import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeals } from "@/lib/getAuthClient";
import {
  readStatementTypeOption,
  resolveClientRates,
} from "@/lib/closingCostRates";
import { computeStatement, type ClosingCostInputs } from "@/lib/closingCosts";
import { applyAdjustments, MAX_AMOUNT } from "@/lib/closingCostAdjustments";
import { closingCostPdfFileName, generateClosingCostPdf } from "@/lib/closingCostPdf";

// POST /api/closing-estimate/my-pdf
//
// Generates a PDF of the estimate the CLIENT built with their own numbers.
//
// Distinct from GET /api/closing-estimate/pdf, which streams the statement the
// firm issued. That one is the firm's document; this one is the client's own
// planning copy, and nothing here is written to `deal_closing_estimates`.
//
// The server recomputes the whole statement from the raw inputs — a client-sent
// total is never read, let alone printed.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      { success: false, error: "Enter your purchase price first." },
      { status: 400 },
    );
  }

  const titleRaw = body.title_premium_override;
  let titleOverride: number | null = null;
  if (titleRaw !== null && titleRaw !== undefined && titleRaw !== "") {
    const n = Number(titleRaw);
    if (Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT) titleOverride = n;
  }

  const propertyTaxRaw = body.property_tax_adjustment;
  let propertyTax: number | null = null;
  if (propertyTaxRaw !== null && propertyTaxRaw !== undefined && propertyTaxRaw !== "") {
    const n = Number(propertyTaxRaw);
    if (Number.isFinite(n) && Math.abs(n) <= MAX_AMOUNT) propertyTax = n;
  }

  // ── The firm's schedule and letterhead ──
  const requestedFirm =
    typeof body.firm_key === "string" && body.firm_key ? body.firm_key : null;

  const dealIds = (auth.deals ?? []).map((d) => d.id);
  let issuedRatesUsed: unknown = null;
  if (dealIds.length > 0 && !requestedFirm) {
    const { data: rows } = await supabaseAdmin
      .from("deal_closing_estimates")
      .select("rates_used")
      .in("deal_id", dealIds)
      .eq("status", "issued")
      .eq("is_deleted", false)
      .order("issued_at", { ascending: false })
      .limit(1);
    issuedRatesUsed = rows?.[0]?.rates_used ?? null;
  }

  const { rates: baseRates, firmKey } = await resolveClientRates(
    issuedRatesUsed,
    requestedFirm,
  );
  const rates = applyAdjustments(baseRates, body.adjustments);

  // The letterhead comes from the firm row itself — rates alone don't carry it.
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

  const statementType = await readStatementTypeOption(body.statement_type);

  const inputs: ClosingCostInputs = {
    price,
    deposit,
    mortgage,
    isToronto: body.is_toronto === true,
    isFirstTimeBuyer: body.is_first_time_buyer === true,
    titlePremiumOverride: titleOverride,
    propertyTaxAdjustment: propertyTax,
  };
  const statement = computeStatement(inputs, rates);

  const str = (v: unknown, max = 300) =>
    String(v ?? "").trim().slice(0, max) || null;

  const fileNo = str(body.file_no_display, 60);

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
      // The client's own copy is always a planning estimate, whatever wording
      // they previewed — so it always carries the draft watermark.
      preparedOn: new Date().toISOString().slice(0, 10),
      draft: true,
    });

    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${closingCostPdfFileName(fileNo)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[closing-estimate my-pdf] generation failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not build your PDF. Please try again." },
      { status: 500 },
    );
  }
}
