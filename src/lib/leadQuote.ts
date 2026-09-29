import supabaseAdmin from "@/lib/supabaseAdmin";
import { getLeadFirmKey } from "@/lib/leadFirm";
import { ratesFromConfigRow } from "@/lib/closingCosts";
import { readFirmAndSharedRow } from "@/lib/closingCostRates";
import type { FirmKey } from "@/lib/firms";
import { quoteFigures, quoteSideFromLeadType, type QuoteSide } from "@/lib/quotePricing";

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
  legalFees: number;
  disbursements: number;
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
  const { row } = await readFirmAndSharedRow(firmKey);
  const { legalFees, disbursements } = quoteFigures(side, ratesFromConfigRow(row));

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
    legalFees,
    disbursements,
  };
}
