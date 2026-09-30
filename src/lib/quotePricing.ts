import type { ClosingCostRates } from "./closingCosts";
import { round2 } from "./closingCosts";

// New-build condo legal fee parts; the agreement review is optional and untotalled.
export const CONDO_FEES = { occupancy: 500, final: 1199, agreementReview: 300 } as const;

// Package legal fees shown on intake Step 1 and quoted in the intake email.
export const QUOTE_LEGAL_FEES = {
  buying: 1199,
  selling: 1099,
  both: 2199,
  refinance: 999,
  condo: CONDO_FEES.occupancy + CONDO_FEES.final,
} as const;

export type QuoteSide = keyof typeof QUOTE_LEGAL_FEES;

// Maps a lead_type to a quote side.
export function quoteSideFromLeadType(leadType: string | null | undefined): QuoteSide | null {
  const lt = (leadType ?? "").toLowerCase();
  if (lt.includes("refinance")) return "refinance";
  if (lt.includes("condo")) return "condo";
  const buy = lt.includes("purchase");
  const sell = lt.includes("sale");
  if (buy && sell) return "both";
  if (buy) return "buying";
  if (sell) return "selling";
  return null;
}

// Firm disbursements before HST; excludes LTT and title premium.
function purchaseDisbursements(r: ClosingCostRates): number {
  return r.legalTitleSubmission + r.adminFee + r.teraview + r.sheriff + r.regTransfer;
}

// Refinance: new mortgage registration plus lender title submission.
function refinanceDisbursements(r: ClosingCostRates): number {
  return r.legalTitleSubmission + r.adminFee + r.teraview + r.sheriff + r.regMortgage;
}

// Refinance and condo only; purchase and sale use src/config/iclosed-fees.yaml.
export function quoteFigures(
  side: "refinance" | "condo",
  rates: ClosingCostRates,
): { legalFees: number; disbursements: number } {
  // Condo: charged at final closing, like a purchase.
  const disbursements = side === "refinance" ? refinanceDisbursements(rates) : purchaseDisbursements(rates);
  return { legalFees: QUOTE_LEGAL_FEES[side], disbursements: round2(disbursements) };
}

// Team named on the quote email and page.
export const QUOTE_TEAM = {
  lawyer: { name: "Gathya Manoharan", lsoNumber: "75591T" },
  csm: { firstName: "Aliya", fullName: "Aliya Ali", phone: "647-426-3769", email: "aliya@iclosed.ca" },
};
