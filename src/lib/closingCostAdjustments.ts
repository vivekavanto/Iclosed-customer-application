// Layering a client's on-screen fee adjustments over a firm's rate schedule.
//
// Shared by the two routes that recompute a client's own estimate server-side
// (/api/closing-estimate/my-pdf and /api/closing-estimate/email) so both apply
// them identically — a PDF that disagreed with the email it was attached to
// would be worse than either being wrong on its own.
//
// These are PREVIEW adjustments. Nothing here is written to
// `deal_closing_estimates`, and changing a figure does not change what the firm
// bills — the client is exploring, not negotiating.

import { ratesFromConfigRow, type ClosingCostRates } from "./closingCosts";

export const MAX_AMOUNT = 1_000_000_000;

/**
 * The fees a client may adjust.
 *
 * Land transfer tax, the rebate caps and the HST rate are deliberately absent:
 * they are statutory, and letting a client "adjust" them would produce a figure
 * that is simply wrong rather than merely hypothetical.
 */
export const ADJUSTABLE_KEYS = [
  "reg_transfer",
  "reg_mortgage",
  "teraview",
  "sheriff",
  "legal_transfer",
  "legal_mortgage",
  "legal_title_submission",
  "admin_fee",
] as const;

/** ClosingCostRates → the snake_case row shape ratesFromConfigRow consumes. */
export function ratesToRow(r: ClosingCostRates): Record<string, unknown> {
  return {
    reg_transfer: r.regTransfer,
    reg_mortgage: r.regMortgage,
    teraview: r.teraview,
    sheriff: r.sheriff,
    legal_transfer: r.legalTransfer,
    legal_mortgage: r.legalMortgage,
    legal_title_submission: r.legalTitleSubmission,
    admin_fee: r.adminFee,
    hst_rate: r.hstRate,
    rebate_ontario_max: r.rebateOntarioMax,
    rebate_toronto_max: r.rebateTorontoMax,
    title_premium_base: r.titlePremiumBase,
    title_premium_rate: r.titlePremiumRate,
    title_premium_min: r.titlePremiumMin,
    ltt_tiers: r.lttTiers,
    mltt_tiers: r.mlttTiers,
  };
}

/**
 * Apply the client's adjustments to `base`.
 *
 * The title premium is NOT handled here — it is an input to computeStatement
 * (titlePremiumOverride), not a rate, because a supplied value replaces the
 * formula rather than feeding it.
 *
 * Out-of-range values are ignored rather than rejected: the on-screen field is
 * already bounded, and failing a PDF download over a stray character would be a
 * worse outcome than quietly falling back to the firm's standard figure.
 */
export function applyAdjustments(
  base: ClosingCostRates,
  raw: unknown,
): ClosingCostRates {
  if (!raw || typeof raw !== "object") return base;
  const supplied = raw as Record<string, unknown>;

  const overrides: Record<string, number> = {};
  for (const key of ADJUSTABLE_KEYS) {
    const value = supplied[key];
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) continue;
    overrides[key] = n;
  }
  if (Object.keys(overrides).length === 0) return base;

  return ratesFromConfigRow({ ...ratesToRow(base), ...overrides });
}
