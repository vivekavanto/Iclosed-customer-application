// New-build condo legal fee parts; the agreement review is optional and untotalled.
export const CONDO_FEES = { occupancy: 500, final: 1199, agreementReview: 300 } as const;

// Package legal fees shown on intake Step 1 and quoted in the intake email.
export const QUOTE_LEGAL_FEES = {
  buying: 1199,
  selling: 1099,
  // Sale plus purchase, less the $100 bundle discount (iclosed-fees.yaml bundles).
  both: 2198,
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

// Team named on the quote email and page.
export const QUOTE_TEAM = {
  lawyer: { name: "Gathya Manoharan", lsoNumber: "75591T" },
  csm: { firstName: "Aliya", fullName: "Aliya Ali", phone: "647-426-3769", email: "aliya@iclosed.ca" },
};
