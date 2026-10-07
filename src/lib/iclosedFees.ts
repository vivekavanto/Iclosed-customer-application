// Types and fee maths for src/config/iclosed-fees.yaml (spec section 5). Pure.
import { round2 } from "@/lib/closingCosts";

export type FeeFileType = "purchase" | "sale" | "refinance" | "new_build_condo";

export interface DisbursementLine {
  amount: number;
  when?: "always" | "has_mortgage";
  per?: "charge";
  hst?: boolean;
  estimate?: boolean;
  range?: [number, number];
}

export interface FileTypeFees {
  label: string;
  quote_prefix: string;
  legal_fees: { standard: number; occupancy?: number; final_closing?: number };
  /** New build condo only; never in totals. */
  agreement_review?: { fee: number; builder_correspondence: number };
  disbursements: Record<string, DisbursementLine>;
  disbursements_label: string;
  disbursements_range?: [number, number];
  title_insurance_estimate?: number | null;
  /** FCT premium estimate by property type. */
  title_insurance_by_property?: Record<"condo" | "freehold", number>;
}

export interface LttBracket {
  up_to: number | null;
  rate: number;
}

export interface LttRegion {
  brackets: LttBracket[];
  first_time_buyer_rebate_max: number;
  administration_fee?: number;
}

export interface ExtraFee {
  fee: number | "at_cost";
  unit?: string;
  applies_to: FeeFileType[];
  registration?: number;
  threshold?: number;
  manual_quote_above?: number;
  threshold_business_days?: number;
  approximate?: boolean;
  estimate?: boolean;
  range?: [number, number];
}

export interface SaleAndPurchaseBundle {
  quote_prefix: string;
  discount: number;
  applies_to: "later_closing";
  same_day: "purchase";
}

export interface IclosedFees {
  tax: { hst_rate: number; hst_on_levy: boolean };
  file_types: Record<FeeFileType, FileTypeFees>;
  extras: Record<string, ExtraFee>;
  land_transfer_tax: { ontario: LttRegion; toronto: LttRegion };
  bundles: { sale_and_purchase: SaleAndPurchaseBundle };
  intake_defaults: { has_mortgage: boolean; charges_count: number; sale_commission_rate?: number };
  retainer: { hst_registration_number: string | null };
}

export interface FeeInputs {
  hasMortgage?: boolean;
  chargesCount?: number;
  /** Positive dollars off the legal fee. */
  discount?: number | null;
  extraPayouts?: number;
  /** Sale: no requisition letter 7 days before closing. */
  sellerTitleSearch?: boolean;
  /** Refinance: the existing lender asks us to register the discharge. */
  dischargeRegistration?: boolean;
}

export interface FeeFigures {
  /** Standard fee plus applied extras, before discount. */
  legalFees: number;
  discount: number;
  disbursements: number;
  /** Each disbursement line that applies, in fee-file order. */
  disbursementLines: { key: string; amount: number; estimate: boolean }[];
  hst: number;
  /** Net legal fees + disbursements + HST. */
  total: number;
}

const LEVY_KEY = "lawpro_levy";

/** Legal fees, disbursements and HST for one file (spec 5.1–5.3). */
export function computeFees(fees: IclosedFees, type: FeeFileType, input: FeeInputs = {}): FeeFigures {
  const ft = fees.file_types[type];
  const hasMortgage = input.hasMortgage ?? fees.intake_defaults.has_mortgage;
  const charges = input.chargesCount ?? fees.intake_defaults.charges_count;
  const payoutFee = fees.extras.extra_payout?.fee;

  const legalFees = round2(
    ft.legal_fees.standard + (input.extraPayouts ?? 0) * (typeof payoutFee === "number" ? payoutFee : 0),
  );
  const discount = round2(Math.max(0, input.discount ?? 0));

  let disbursements = 0;
  let taxable = 0;
  const disbursementLines: FeeFigures["disbursementLines"] = [];
  for (const [key, line] of Object.entries(ft.disbursements)) {
    if (line.when === "has_mortgage" && !hasMortgage) continue;
    const amount = round2(line.amount * (line.per === "charge" ? charges : 1));
    disbursements += amount;
    disbursementLines.push({ key, amount, estimate: Boolean(line.estimate) });
    if (line.hst && (key !== LEVY_KEY || fees.tax.hst_on_levy)) taxable += amount;
  }
  // Pass-through extras that become disbursements, no HST (spec 5.2).
  const passThrough: [string, boolean | undefined, boolean][] = [
    ["seller_title_search", input.sellerTitleSearch, true],
    ["discharge_registration", input.dischargeRegistration, false],
  ];
  for (const [key, on, estimate] of passThrough) {
    const extra = fees.extras[key];
    if (!on || !extra?.applies_to.includes(type) || typeof extra.fee !== "number") continue;
    disbursements += extra.fee;
    disbursementLines.push({ key, amount: round2(extra.fee), estimate });
  }
  disbursements = round2(disbursements);

  const netLegal = round2(legalFees - discount);
  const hst = round2(fees.tax.hst_rate * (netLegal + taxable));
  return { legalFees, discount, disbursements, disbursementLines, hst, total: round2(netLegal + disbursements + hst) };
}

export type BundleSide = "sale" | "purchase";

/** Spec 5.3a: later closing gets the discount; ties go to purchase. */
export function bundleDiscountSide(saleClosing: string | null, purchaseClosing: string | null): BundleSide {
  if (saleClosing && purchaseClosing && saleClosing.slice(0, 10) > purchaseClosing.slice(0, 10)) return "sale";
  return "purchase";
}

export interface BundleFigures {
  discountSide: BundleSide;
  sale: FeeFigures;
  purchase: FeeFigures;
  /** Both legal fees, net of the bundle discount. */
  legalFees: number;
  disbursements: number;
}

/** Sale and purchase figures, discount on one file. */
export function computeBundle(
  fees: IclosedFees,
  input: { saleClosing: string | null; purchaseClosing: string | null; sale?: FeeInputs; purchase?: FeeInputs },
): BundleFigures {
  const discountSide = bundleDiscountSide(input.saleClosing, input.purchaseClosing);
  const off = fees.bundles.sale_and_purchase.discount;
  const withDiscount = (side: BundleSide, i: FeeInputs = {}): FeeInputs =>
    side === discountSide ? { ...i, discount: i.discount ?? off } : i;
  const sale = computeFees(fees, "sale", withDiscount("sale", input.sale));
  const purchase = computeFees(fees, "purchase", withDiscount("purchase", input.purchase));
  return {
    discountSide,
    sale,
    purchase,
    legalFees: round2(sale.legalFees - sale.discount + purchase.legalFees - purchase.discount),
    disbursements: round2(sale.disbursements + purchase.disbursements),
  };
}

/** "$250" for whole dollars, "$1,199.50" otherwise. */
export function dollars(n: number): string {
  const whole = Number.isInteger(n);
  return `$${n.toLocaleString("en-CA", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "$1.5M", "$3M". */
export function millions(n: number): string {
  return `$${Number((n / 1_000_000).toFixed(2))}M`;
}

/** FCT estimate by property type, else the flat estimate. */
export function titleInsuranceEstimate(ft: FileTypeFees, condo: boolean | null): number {
  const byType = ft.title_insurance_by_property;
  if (!byType || condo === null) return ft.title_insurance_estimate ?? 0;
  return condo ? byType.condo : byType.freehold;
}
