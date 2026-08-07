// Which closing-cost inputs a client owns, and which belong to their file.
//
// The pure half of `clientEstimateContext.ts` — no Supabase, no session, no
// `window` — so the rule every portal route enforces can be asserted directly
// in `src/lib/__tests__/clientEstimateLock.test.ts`. Same split as
// `closingCostSettings.ts` (pure) against `closingCostRates.ts` (database).

/** $1B — well past any residential purchase. */
export const MAX_AMOUNT = 1_000_000_000;

/**
 * The only two things a client may tell us.
 *
 * "Cash deal" is not a third flag: a mortgage of 0 IS a cash deal, so deriving
 * it means the two can never disagree.
 */
export const CLIENT_EDITABLE_KEYS = [
  "mortgage_amount",
  "is_first_time_buyer",
] as const;

/**
 * Not an input — a SELECTOR.
 *
 * `file_id` says which of the client's own files to work on, for a buyer who
 * has more than one. It changes nothing about the estimate; it only chooses
 * whose figures are read. Safe to accept because the resolver checks it against
 * the session's own deals and answers 404 on a miss, so naming someone else's
 * file reveals nothing about it.
 */
export const CLIENT_SELECTOR_KEYS = ["file_id"] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A supplied file id, or null for "use my default file".
 *
 * Returns an error rather than silently ignoring a malformed id: a caller that
 * asked for a specific file and got a different one's figures back would have
 * no way to tell.
 */
export function parseFileId(raw: unknown): string | null | { error: string } {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string" || !UUID_RE.test(raw)) {
    return { error: "That file could not be found on your account." };
  }
  return raw;
}

/**
 * Fields that belong to the file, not to the caller.
 *
 * Supplying one is rejected outright rather than ignored. Silently dropping it
 * would hand back a PDF that disagrees with what was asked for, and would let a
 * real tampering attempt look like it succeeded.
 *
 * `to` is in here for the same reason as the rest: the estimate is emailed to
 * the address on the client's file. Accepting a recipient would turn an
 * authenticated planning tool into a way to send firm-branded attachments to
 * anyone.
 */
export const LOCKED_INPUT_KEYS = [
  "purchase_price",
  "deposit_paid",
  "is_toronto",
  "title_premium_override",
  "provincial_ltt_override",
  "municipal_ltt_override",
  "property_tax_adjustment",
  "firm_key",
  "statement_type",
  "file_no_display",
  "purchasers",
  "property_address",
  "closing_date",
  "adjustments",
  "rate_overrides",
  "to",
] as const;

/**
 * A client-safe complaint about a locked field, or null when the body is clean.
 *
 * Presence is what is checked, not the value: a `null` or `""` for a locked key
 * is still the caller asserting control over something that is not theirs.
 *
 * `hasOwnProperty` via the prototype rather than `key in body`, so a body
 * carrying a key like "constructor" cannot match through the prototype chain.
 */
export function rejectLockedInputs(body: Record<string, unknown>): string | null {
  for (const key of LOCKED_INPUT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return `"${key}" is taken from your file and cannot be supplied.`;
    }
  }
  return null;
}

/** Validate the one amount a client may send. */
export function parseClientMortgage(raw: unknown): number | { error: string } {
  const value = raw === null || raw === undefined || raw === "" ? 0 : Number(raw);
  if (!Number.isFinite(value)) return { error: "Mortgage amount must be a number" };
  if (value < 0) return { error: "Mortgage amount cannot be negative" };
  if (value > MAX_AMOUNT) return { error: "Mortgage amount is unrealistically large" };
  return value;
}
