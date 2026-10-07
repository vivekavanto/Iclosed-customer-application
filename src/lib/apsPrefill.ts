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
  // Keep the decimal point so "25000.50" isn't read as 2,500,050.
  const numeric = parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric)) return "";
  return `$${new Intl.NumberFormat("en-US").format(Math.round(numeric))}`;
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
    // Deposits are only captured for purchases.
    ...(side === "purchase" ? (["depositAmount"] as PrefillKey[]) : []),
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

  if (side === "purchase") {
    push(
      "depositAmount",
      result.deposit.value ? formatCurrencyValue(result.deposit.value) : null,
      result.deposit.confidence,
    );
  }

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
 * The first party named on the agreement is the person the file is opened for;
 * everyone after them is a co-party.
 *
 * This is the whole rule, and it is deliberately not clever. The intake used to
 * try to work out which party was the signed-in account holder and treat THAT
 * one as "you" — which meant a client submitting on behalf of the first
 * purchaser, or one signed in under a slightly different spelling, ended up
 * absent from their own file while every purchaser on the document was listed
 * as a co-purchaser. Reading order is what the document itself says, needs no
 * account to interpret, and is what the client sees when they check it.
 */
export function splitPrimaryParty(names: string[]): {
  primary: string | null;
  others: string[];
} {
  if (names.length === 0) return { primary: null, others: [] };
  return { primary: names[0], others: names.slice(1) };
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
): ApsAgentDetails | null {
  const wanted = side === "sale" ? "listing" : "cooperating";
  const named = result.agents.filter((a) => a.full_name);
  if (named.length === 0) return null;

  const match = named.find((a) => a.role === wanted) ?? named[0];
  return {
    name: match.full_name as string,
    company: match.brokerage,
    // Only ever what was printed on the document. The contact step shows these
    // in editable fields, so a blank one costs the client a line of typing —
    // a wrong one costs someone else our emails about a file they aren't on.
    email: match.email,
    phone: match.phone,
  };
}

/** The agent details the contact step seeds its referral fields from. */
export interface ApsAgentDetails {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
}


// ── Is the signed-in visitor named on this agreement? ──────────────────────
//
// Asked for one reason only: a visitor who is signed in as one person and
// uploading another person's agreement is signed out, with an explanation. The
// intake itself takes its parties from the document either way — the account
// plays no part in filling the form in.
//
// The comparison is deliberately TOLERANT, because the two failure modes cost
// wildly different amounts. A false mismatch signs a real client out of their
// own account over a middle initial. A false match just leaves a session alone.

/**
 * The parts of a name that actually identify a person.
 *
 * Punctuation goes, so "Mohammed, Haneef Mugdi" reads as three names rather
 * than a surname glued to a comma. Case goes. Single letters go with them: an
 * initial is not a name, which is what makes "Rehana M Haneef" and "Rehana
 * Haneef" the same person.
 */
export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

/**
 * Plausibly the same person, named twice?
 *
 * The shorter name has to be wholly contained in the longer one, order
 * ignored — which is what handles a middle name on one side, a surname-first
 * entry on the other, and a document that prints a name in full where an
 * account holds it short.
 *
 * One shared token is not a match: "John" and "John Smith" are as likely to be
 * two people as one, and signing the wrong one out is the expensive mistake.
 * The exception is a name that genuinely has one part, which some do.
 */
export function isSamePerson(a: string, b: string): boolean {
  const first = new Set(nameTokens(a));
  const second = new Set(nameTokens(b));
  if (first.size === 0 || second.size === 0) return false;

  const [smaller, larger] =
    first.size <= second.size ? [first, second] : [second, first];

  for (const token of smaller) {
    if (!larger.has(token)) return false;
  }

  return smaller.size >= 2 || larger.size === 1;
}

/**
 * Is the signed-in visitor one of the parties named here?
 *
 * True when there is nobody to check against — an empty party list says the
 * read found no names, which tells us nothing about who signed the agreement
 * and is no reason to end anybody's session.
 */
export function accountIsAParty(names: string[], accountName: string): boolean {
  if (!accountName.trim() || names.length === 0) return true;
  return names.some((name) => isSamePerson(name, accountName));
}
