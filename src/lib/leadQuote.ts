import supabaseAdmin from "@/lib/supabaseAdmin";
import { getLeadFirmKey } from "@/lib/leadFirm";
import { ratesFromConfigRow, round2 } from "@/lib/closingCosts";
import { readFirmAndSharedRow } from "@/lib/closingCostRates";
import type { FirmKey } from "@/lib/firms";
import { QUOTE_LEGAL_FEES, quoteFigures, quoteSideFromLeadType, type QuoteSide } from "@/lib/quotePricing";
import { computeFees, type IclosedFees } from "@/lib/iclosedFees";
import { loadIclosedFees } from "@/lib/loadIclosedFees";

type Addr = {
  street?: string | null;
  unit?: string | null;
  city?: string | null;
  province?: string | null;
  postal?: string | null;
};

export interface LeadQuote {
  leadId: string;
  firmKey: FirmKey;
  side: QuoteSide;
  firstName: string | null;
  email: string | null;
  /** Street only, e.g. "424 Calderstone Crescent". */
  propertyShort: string;
  /** Street and city, e.g. "424 Calderstone Crescent, Toronto". */
  propertyFull: string;
  purchaseAddress: string;
  saleAddress: string;
  purchasePrice: number | null;
  salePrice: number | null;
  purchaseClosingDate: string | null;
  saleClosingDate: string | null;
  createdAt: string | null;
  /** From fee settings for purchase and sale, else "Disbursements". */
  disbursementsLabel: string;
  /** e.g. "26P-0411"; purchase and sale only, else null. */
  quoteNumber: string | null;
  legalFees: number;
  disbursements: number;
}

// Purchase and sale figures come from src/config/iclosed-fees.yaml.
function feeFileFigures(
  fees: IclosedFees,
  side: "buying" | "selling" | "both",
): { legalFees: number; disbursements: number } {
  if (side === "both") {
    const disb = computeFees(fees, "purchase").disbursements + computeFees(fees, "sale").disbursements;
    return { legalFees: QUOTE_LEGAL_FEES.both, disbursements: round2(disb) };
  }
  const f = computeFees(fees, side === "buying" ? "purchase" : "sale");
  return { legalFees: f.legalFees, disbursements: f.disbursements };
}

// "26P-0411": count of same-type primary leads that year.
async function quoteNumberFor(
  lead: { id: string; lead_type: string; created_at: string | null },
  prefix: string,
): Promise<string | null> {
  if (!lead.created_at) return null;
  const year = new Date(lead.created_at).getUTCFullYear();
  const { count, error } = await supabaseAdmin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("lead_type", lead.lead_type)
    .is("parent_lead_id", null)
    .gte("created_at", `${year}-01-01T00:00:00Z`)
    .lte("created_at", lead.created_at);
  if (error || !count) return null;
  return `${String(year).slice(2)}${prefix}-${String(count).padStart(4, "0")}`;
}

function shortAddress(a: Addr): string {
  const street = (a.street ?? "").trim();
  const unit = (a.unit ?? "").trim();
  return unit && street ? `${unit} - ${street}` : street;
}

function cityAddress(a: Addr): string {
  return [shortAddress(a), (a.city ?? "").trim()].filter(Boolean).join(", ");
}

// "424 Calderstone Crescent, Toronto, Ontario M1C 3A7"
function postalAddress(a: Addr): string {
  const region = [a.province, a.postal].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return [cityAddress(a), region].filter(Boolean).join(", ");
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
}

/** Loads a lead and prices its quote; null for lead types without a quote. */
export async function loadLeadQuote(leadId: string): Promise<LeadQuote | null> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select(
      "id, first_name, email, lead_type, price, selling_price, closing_date, selling_closing_date, created_at, address_street, address_unit, address_city, address_province, address_postal_code, selling_address_street, selling_address_unit, selling_address_city, selling_address_province, selling_address_postal_code",
    )
    .eq("id", leadId)
    .maybeSingle();

  const side = quoteSideFromLeadType(lead?.lead_type);
  if (!lead || !side) return null;

  const purchase: Addr = {
    street: lead.address_street,
    unit: lead.address_unit,
    city: lead.address_city,
    province: lead.address_province,
    postal: lead.address_postal_code,
  };
  const sale: Addr = {
    street: lead.selling_address_street,
    unit: lead.selling_address_unit,
    city: lead.selling_address_city,
    province: lead.selling_address_province,
    postal: lead.selling_address_postal_code,
  };
  // Sale-only intakes store the property in the primary address fields.
  const saleAddr = side === "selling" && !sale.street ? purchase : sale;
  const join = (a: string, b: string) => [a, b].filter(Boolean).join(" and ");
  const primary = side === "selling" ? saleAddr : purchase;

  const firmKey = await getLeadFirmKey(leadId);
  const fees = loadIclosedFees();
  const figures =
    side === "refinance" || side === "condo"
      ? quoteFigures(side, ratesFromConfigRow((await readFirmAndSharedRow(firmKey)).row))
      : feeFileFigures(fees, side);
  const { legalFees, disbursements } = figures;
  const feeType = side === "buying" ? "purchase" : side === "selling" ? "sale" : null;
  const prefix = feeType ? fees.file_types[feeType].quote_prefix : undefined;
  const quoteNumber = prefix ? await quoteNumberFor(lead, prefix) : null;

  return {
    leadId: lead.id,
    firmKey,
    side,
    firstName: lead.first_name ?? null,
    email: lead.email ?? null,
    propertyShort:
      side === "both" ? join(shortAddress(purchase), shortAddress(sale)) : shortAddress(primary),
    propertyFull:
      side === "both" ? join(cityAddress(purchase), cityAddress(sale)) : cityAddress(primary),
    purchaseAddress: side === "selling" ? "" : postalAddress(purchase),
    saleAddress: side === "selling" || side === "both" ? postalAddress(saleAddr) : "",
    // Sale-only intakes store the sale price in `price`; a refinance has no price.
    purchasePrice: side === "selling" || side === "refinance" ? null : numOrNull(lead.price),
    salePrice:
      side === "selling" ? numOrNull(lead.price) : side === "both" ? numOrNull(lead.selling_price) : null,
    purchaseClosingDate: side === "selling" ? null : lead.closing_date ?? null,
    saleClosingDate: side === "selling" ? lead.closing_date ?? null : lead.selling_closing_date ?? null,
    createdAt: lead.created_at ?? null,
    quoteNumber,
    disbursementsLabel: feeType ? fees.file_types[feeType].disbursements_label : "Disbursements",
    legalFees,
    disbursements,
  };
}
