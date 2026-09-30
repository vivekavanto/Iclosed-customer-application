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
  legal_fees: { standard: number };
  disbursements: Record<string, DisbursementLine>;
  disbursements_label: string;
  disbursements_range?: [number, number];
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
}

export interface IclosedFees {
  tax: { hst_rate: number; hst_on_levy: boolean };
  file_types: Record<FeeFileType, FileTypeFees>;
  extras: Record<string, ExtraFee>;
  intake_defaults: { has_mortgage: boolean; charges_count: number };
  retainer: { hst_registration_number: string | null };
}

export interface FeeInputs {
  hasMortgage?: boolean;
  chargesCount?: number;
  /** Positive dollars off the legal fee. */
  discount?: number | null;
  extraPayouts?: number;
}

export interface FeeFigures {
  /** Standard fee plus applied extras, before discount. */
  legalFees: number;
  discount: number;
  disbursements: number;
  hst: number;
  /** Net legal fees + disbursements + HST. */
  total: number;
}

const LEVY_KEY = "law_society_levy";

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
  for (const [key, line] of Object.entries(ft.disbursements)) {
    if (line.when === "has_mortgage" && !hasMortgage) continue;
    const amount = round2(line.amount * (line.per === "charge" ? charges : 1));
    disbursements += amount;
    if (line.hst && (key !== LEVY_KEY || fees.tax.hst_on_levy)) taxable += amount;
  }
  disbursements = round2(disbursements);

  const netLegal = round2(legalFees - discount);
  const hst = round2(fees.tax.hst_rate * (netLegal + taxable));
  return { legalFees, discount, disbursements, hst, total: round2(netLegal + disbursements + hst) };
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
