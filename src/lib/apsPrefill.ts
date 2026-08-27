// Turns an APS read into a flat list of "this field should say this" entries.
//
// Kept out of the intake page so the mapping decisions live in one testable
// place: which side of a Buy & Sell an agreement belongs to, which slot each
// value lands in, and how a raw extracted amount becomes the formatted string
// the price field actually holds.
//
// Nothing here writes anything. The page decides what to apply, guarded by
// which fields the client has already touched.

import type { ApsExtractionResult, ApsSide, Confidence } from "@/lib/apsExtraction";

/**
 * Every intake field an APS can fill. Stringly-typed on purpose: these keys are
 * the shared vocabulary between the page (which applies them), Step2 (which
 * marks them and reports edits) and the touched/prefilled sets.
 */
export type PrefillKey =
  | "purchasePrice"
  | "sellingPrice"
  | "depositAmount"
  | "sellingDepositAmount"
  | "closingDate"
  | "sellingClosingDate"
  | "address.street"
  | "address.unit"
  | "address.city"
  | "address.postalCode"
  | "sellingAddress.street"
  | "sellingAddress.unit"
  | "sellingAddress.city"
  | "sellingAddress.postalCode";

export interface PrefillEntry {
  key: PrefillKey;
  /** Ready to drop straight into the field — already formatted as the field expects. */
  value: string;
  confidence: Confidence;
}

/**
 * Matches Step2's own formatCurrency so a prefilled price is character-for-
 * character what the client would have typed. Anything else and the field
 * reformats on first keystroke, which reads as the form "changing" their value.
 */
export function formatCurrencyValue(raw: string): string {
  const numeric = raw.replace(/[^0-9]/g, "");
  if (!numeric) return "";
  return `$${new Intl.NumberFormat("en-US").format(parseInt(numeric, 10))}`;
}

/**
 * Does this agreement's data belong in the "selling" slot?
 *
 * Only Buy & Sell has two slots. In a selling-only intake the sale property IS
 * the primary property, so a sale-side agreement fills the primary fields —
 * getting this backwards would silently drop every value on a Sale intake.
 */
export function usesSellingSlot(
  side: ApsSide,
  closingOption: string | null,
): boolean {
  return closingOption === "both" && side === "sale";
}

/**
 * Every key an agreement on this side could have filled.
 *
 * Used when a file is removed or the answer flips to "No": the fields that
 * agreement was responsible for get cleared, rather than trying to remember
 * exactly which ones a particular read happened to populate.
 */
export function keysForSide(
  side: ApsSide,
  closingOption: string | null,
): PrefillKey[] {
  const selling = usesSellingSlot(side, closingOption);
  const prefix = selling ? "sellingAddress" : "address";
  return [
    selling ? "sellingPrice" : "purchasePrice",
    selling ? "sellingDepositAmount" : "depositAmount",
    selling ? "sellingClosingDate" : "closingDate",
    `${prefix}.street` as PrefillKey,
    `${prefix}.unit` as PrefillKey,
    `${prefix}.city` as PrefillKey,
    `${prefix}.postalCode` as PrefillKey,
  ];
}

export function buildPrefillEntries(
  result: ApsExtractionResult,
  side: ApsSide,
  closingOption: string | null,
): PrefillEntry[] {
  if (!result.is_aps) return [];

  const selling = usesSellingSlot(side, closingOption);
  const entries: PrefillEntry[] = [];

  const push = (key: PrefillKey, value: string | null, confidence: Confidence) => {
    if (!value) return;
    entries.push({ key, value, confidence });
  };

  push(
    selling ? "sellingPrice" : "purchasePrice",
    result.purchase_price.value ? formatCurrencyValue(result.purchase_price.value) : null,
    result.purchase_price.confidence,
  );

  push(
    selling ? "sellingDepositAmount" : "depositAmount",
    result.deposit.value ? formatCurrencyValue(result.deposit.value) : null,
    result.deposit.confidence,
  );

  push(
    selling ? "sellingClosingDate" : "closingDate",
    result.closing_date.value,
    result.closing_date.confidence,
  );

  const address = result.property_address;
  const prefix = selling ? "sellingAddress" : "address";
  push(`${prefix}.street` as PrefillKey, address.street, address.confidence);
  push(`${prefix}.unit` as PrefillKey, address.unit, address.confidence);
  push(`${prefix}.city` as PrefillKey, address.city, address.confidence);
  push(`${prefix}.postalCode` as PrefillKey, address.postal_code, address.confidence);

  return entries;
}

/**
 * The parties whose names belong on the co-person cards for this intake.
 *
 * A buying client's co-purchasers are the OTHER buyers on the agreement; the
 * sellers are the people on the far side of the deal and are none of our
 * business at intake. Buy & Sell pulls both, one from each agreement.
 */
export function partiesForSide(
  result: ApsExtractionResult,
  side: ApsSide,
): { role: "purchaser" | "seller"; names: string[] } {
  return side === "sale"
    ? { role: "seller", names: result.sellers.map((s) => s.full_name) }
    : { role: "purchaser", names: result.buyers.map((b) => b.full_name) };
}

/**
 * The agent to seed into the partner search — the one on the client's own side
 * where the roles are known, otherwise the first named agent.
 *
 * Returns null when the agreement named a brokerage but no individual: the
 * search field takes a person's name, and putting a firm in it would create a
 * partner record shaped wrong.
 */
export function agentForSide(
  result: ApsExtractionResult,
  side: ApsSide,
): { name: string; company: string | null } | null {
  const wanted = side === "sale" ? "listing" : "cooperating";
  const named = result.agents.filter((a) => a.full_name);
  if (named.length === 0) return null;

  const match = named.find((a) => a.role === wanted) ?? named[0];
  return { name: match.full_name as string, company: match.brokerage };
}

// ── Who on the agreement is the signed-in client? ──────────────────────────
//
// An APS with two buyers names the purchaser AND one co-purchaser — never two
// co-purchasers. Before this check the intake had no way to tell which of the
// two was the person filling the form, so it seeded a card for both and the
// client ended up listed alongside themselves.
//
// Matching is exact and case-insensitive, by decision: a looser match risks
// consuming a genuine co-purchaser as "you" and silently dropping them from
// the file, which is worse than asking the client to check the document.

/**
 * Case/whitespace-insensitive form of a person's name.
 *
 * Only casing and run-together whitespace are normalized — a middle name, an
 * initial or a "Smith, John" reversal is a real difference here and will not
 * match, which is what "exact" means for this gate.
 */
export function normalizePartyName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Splits an agreement's parties into the signed-in client and everyone else.
 *
 * Exactly one entry is consumed as `self`, even when the agreement names the
 * same person twice — the rest stay co-parties, so N parties always yield
 * N-1 cards once the client is matched.
 */
export function splitSelfFromParties(
  names: string[],
  selfName: string,
): { self: string | null; others: string[] } {
  const target = normalizePartyName(selfName);
  if (!target) return { self: null, others: names };

  const index = names.findIndex((n) => normalizePartyName(n) === target);
  if (index === -1) return { self: null, others: names };

  return {
    self: names[index],
    others: [...names.slice(0, index), ...names.slice(index + 1)],
  };
}

/** Which role the client should hold on an agreement read from this side. */
export type PartyRole = "purchaser" | "seller";

export type SelfPartyCheck =
  /** Nothing to check against — not signed in, or the account has no name. */
  | { status: "unverifiable" }
  /** The read found no parties on the client's side, so there is nothing to match. */
  | { status: "no-parties"; role: PartyRole }
  /** The client is named on the agreement. `others` are the co-parties. */
  | { status: "match"; role: PartyRole; self: string; others: string[] }
  /** The client is NOT named on their side of the agreement. */
  | {
      status: "mismatch";
      role: PartyRole;
      /** Names the agreement DID give for that role, so the error can list them. */
      names: string[];
      /** True when they were found on the far side instead (buyer vs seller mix-up). */
      onOppositeSide: boolean;
    };

/**
 * Is the signed-in client a party to this agreement, and if so which co-parties
 * are left over?
 *
 * `no-parties` is deliberately NOT a mismatch: a read that pulled no names at
 * all tells us nothing about who signed, and blocking on it would trap a client
 * holding a perfectly valid agreement behind a bad OCR pass.
 */
export function checkSelfOnAgreement(
  result: ApsExtractionResult,
  side: ApsSide,
  selfName: string | null | undefined,
): SelfPartyCheck {
  const target = normalizePartyName(selfName ?? "");
  if (!target) return { status: "unverifiable" };

  // Not an agreement at all — Step 2 already says so in its own words, and the
  // party lists on a non-APS read mean nothing to check against.
  if (!result.is_aps) return { status: "unverifiable" };

  const { role, names } = partiesForSide(result, side);
  if (names.length === 0) return { status: "no-parties", role };

  const { self, others } = splitSelfFromParties(names, target);
  if (self) return { status: "match", role, self, others };

  // Named on the other side of the deal — a different problem from "not on the
  // document at all", and worth saying so.
  const opposite = side === "sale" ? result.buyers : result.sellers;
  const onOppositeSide = opposite.some(
    (p) => normalizePartyName(p.full_name) === target,
  );

  return { status: "mismatch", role, names, onOppositeSide };
}
