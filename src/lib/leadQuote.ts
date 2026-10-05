import supabaseAdmin from "@/lib/supabaseAdmin";
import { getLeadFirmKey } from "@/lib/leadFirm";
import type { FirmKey } from "@/lib/firms";
import { quoteSideFromLeadType, type QuoteSide } from "@/lib/quotePricing";
import { computeBundle, computeFees, type BundleSide, type FeeFileType, type IclosedFees } from "@/lib/iclosedFees";
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
  /** From fee settings. */
  disbursementsLabel: string;
  /** e.g. "26P-0411"; bundles use the C prefix. */
  quoteNumber: string | null;
  /** Net of any bundle discount. */
  legalFees: number;
  disbursements: number;
  /** Sale and purchase bundle only (spec 7A). */
  bundle: QuoteBundle | null;
}

export interface QuoteBundle {
  discountSide: BundleSide;
  discount: number;
  /** Street only, for the email opening. */
  saleProperty: string;
  purchaseProperty: string;
  sale: { legalFees: number; disbursements: number };
  purchase: { legalFees: number; disbursements: number };
}

// Fee-file type per quote side; null is a bundle.
const FEE_TYPE: Record<QuoteSide, FeeFileType | null> = {
  buying: "purchase",
  selling: "sale",
  refinance: "refinance",
  condo: "new_build_condo",
  both: null,
};

// Single-type figures from src/config/iclosed-fees.yaml.
function feeFileFigures(fees: IclosedFees, type: FeeFileType): { legalFees: number; disbursements: number } {
  const f = computeFees(fees, type);
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
  const feeType = FEE_TYPE[side];
  const saleClosing = side === "selling" ? lead.closing_date ?? null : lead.selling_closing_date ?? null;
  const b = feeType
    ? null
    : computeBundle(fees, { saleClosing, purchaseClosing: lead.closing_date ?? null });
  const { legalFees, disbursements } = b ?? feeFileFigures(fees, feeType!);
  const bundle: QuoteBundle | null = b && {
    discountSide: b.discountSide,
    discount: b[b.discountSide].discount,
    saleProperty: shortAddress(saleAddr),
    purchaseProperty: shortAddress(purchase),
    sale: { legalFees: b.sale.legalFees, disbursements: b.sale.disbursements },
    purchase: { legalFees: b.purchase.legalFees, disbursements: b.purchase.disbursements },
  };
  const prefix = feeType ? fees.file_types[feeType].quote_prefix : fees.bundles.sale_and_purchase.quote_prefix;
  const quoteNumber = prefix ? await quoteNumberFor(lead, prefix) : null;

  return {
    leadId: lead.id,
    firmKey,
    side,
    firstName: lead.first_name ?? null,
    email: lead.email ?? null,
    // Bundles name the sale first (spec 7A).
    propertyShort:
      side === "both" ? join(shortAddress(sale), shortAddress(purchase)) : shortAddress(primary),
    propertyFull:
      side === "both" ? join(cityAddress(sale), cityAddress(purchase)) : cityAddress(primary),
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
    disbursementsLabel: fees.file_types[feeType ?? "purchase"].disbursements_label,
    legalFees,
    disbursements,
    bundle,
  };
}
