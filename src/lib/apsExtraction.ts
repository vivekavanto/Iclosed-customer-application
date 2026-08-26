// Shared contract for reading an Agreement of Purchase and Sale.
//
// Both sides of the wire import this: /api/intake/extract-aps normalizes the
// model's JSON into an ApsExtractionResult before returning it, and the intake
// form consumes that same shape when deciding what to prefill. Keeping the
// types AND the normalizers here is deliberate — a value the client is about to
// drop into a validated form field must have been through the same cleanup the
// server applied, or the two disagree about what "valid" means.
//
// Isomorphic: no server-only imports, so this is safe in a client component.

import {
  normalizePostalCode,
  validateCity,
  validatePostalCode,
} from "@/lib/addressValidation";

export type ApsSide = "purchase" | "sale";

export type Confidence = "high" | "medium" | "low";

/**
 * A single read value. `null` means "not found / not readable" — which is an
 * ordinary outcome, not an error. `confidence` gates whether the intake form
 * fills the field outright or offers it as a suggestion.
 */
export interface ExtractedValue {
  value: string | null;
  confidence: Confidence;
}

export interface ExtractedAddress {
  street: string | null;
  unit: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  confidence: Confidence;
}

export interface ExtractedParty {
  full_name: string;
}

export interface ExtractedAgent {
  full_name: string | null;
  brokerage: string | null;
  role: "listing" | "cooperating" | "unknown";
  email: string | null;
  phone: string | null;
}

export interface ApsExtractionResult {
  is_aps: boolean;
  purchase_price: ExtractedValue;
  deposit: ExtractedValue;
  closing_date: ExtractedValue;
  property_address: ExtractedAddress;
  buyers: ExtractedParty[];
  sellers: ExtractedParty[];
  agents: ExtractedAgent[];
  /** What the document appeared to be, when is_aps is false. */
  reason: string;
}

/** Per-side extraction state held by the intake page. */
export type ApsExtractionStatus =
  | "idle"
  | "uploading"
  | "reading"
  | "done"
  | "error";

export interface ApsExtractionState {
  status: ApsExtractionStatus;
  /** The file the current result was read from — shown in the status line. */
  fileName: string | null;
  result: ApsExtractionResult | null;
  error: string | null;
}

export const EMPTY_EXTRACTION_STATE: ApsExtractionState = {
  status: "idle",
  fileName: null,
  result: null,
  error: null,
};

// Same bounds Step2 enforces on a typed price, applied to a read one so an
// extraction can never push a value into the form that the form itself would
// reject.
const MIN_PRICE = 10_000;
const MAX_PRICE = 10_000_000;
// A deposit has no sensible floor (some agreements carry a token $1) but it
// can't exceed the price ceiling.
const MAX_DEPOSIT = MAX_PRICE;

const CONFIDENCES: ReadonlySet<string> = new Set(["high", "medium", "low"]);

function asString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function normalizeConfidence(raw: unknown): Confidence {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return CONFIDENCES.has(value) ? (value as Confidence) : "low";
}

/**
 * "$1,250,000.00" / "1250000" / "One million" -> "1250000" or null.
 *
 * Digits only in, digits only out — the form re-applies its own currency
 * formatting, so returning a formatted string here would double-format.
 */
export function normalizeAmount(
  raw: unknown,
  { min = 0, max = MAX_PRICE }: { min?: number; max?: number } = {},
): string | null {
  const text = asString(raw);
  if (!text) return null;

  const digits = text.replace(/[^0-9.]/g, "");
  if (!digits) return null;

  const numeric = Number.parseFloat(digits);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < min || numeric > max) return null;

  // Drop a trailing ".00" so the value looks like something a person typed.
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

/**
 * Strict ISO "YYYY-MM-DD" only. The prompt asks for ISO; anything else is
 * treated as unreadable rather than guessed at, because a misread closing date
 * that looks plausible is worse than a blank field.
 */
export function normalizeIsoDate(raw: unknown): string | null {
  const text = asString(raw);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-trip catches overflow dates like "2026-02-31", which Date silently
  // rolls forward into March.
  if (parsed.toISOString().slice(0, 10) !== text) return null;

  return text;
}

/**
 * "Unit 4B" / "Suite 200" / "Apt. 3" -> "4B" / "200" / "3".
 *
 * The field is already labelled "Unit / Apartment / Suite", so a value that
 * repeats the label reads as a mistake. It also matters for correctness: the
 * duplicate-lead and converted-deal checks in /api/intake compare units after
 * lowercasing and stripping spaces, so a stored "Unit 4B" would never match the
 * "4B" a person would have typed for the same address.
 */
export function normalizeUnit(raw: unknown): string | null {
  const text = asString(raw);
  if (!text) return null;
  const stripped = text
    .replace(/^(unit|suite|ste|apt|apartment|#)[\s.·-]*/i, "")
    .trim();
  return stripped || text;
}

/** Collapse internal whitespace so "JANE   SMITH" reads as a typed name. */
export function normalizePersonName(raw: unknown): string | null {
  const text = asString(raw);
  if (!text) return null;
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length >= 2 ? collapsed : null;
}

/**
 * Address components, each independently kept or dropped.
 *
 * City and postal code are run through the SAME validators Step2 uses. A
 * component that would fail the form's own validation is discarded rather than
 * written, so an extraction can never leave the client staring at a prefilled
 * field they can't get past.
 */
export function normalizeAddress(raw: unknown): ExtractedAddress {
  const source = (raw ?? {}) as Record<string, unknown>;

  const city = asString(source.city);
  const postal = asString(source.postal_code);

  const normalizedPostal = postal ? normalizePostalCode(postal).trim() : "";

  return {
    street: asString(source.street),
    unit: normalizeUnit(source.unit),
    city: city && !validateCity(city) ? city : null,
    province: asString(source.province),
    postal_code:
      normalizedPostal && !validatePostalCode(normalizedPostal)
        ? normalizedPostal
        : null,
    confidence: normalizeConfidence(source.confidence),
  };
}

function normalizeValue(
  raw: unknown,
  normalizer: (value: unknown) => string | null,
): ExtractedValue {
  const source = (raw ?? {}) as Record<string, unknown>;
  return {
    value: normalizer(source.value),
    confidence: normalizeConfidence(source.confidence),
  };
}

function normalizeParties(raw: unknown): ExtractedParty[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ExtractedParty[] = [];

  for (const entry of raw) {
    const name = normalizePersonName(
      (entry as Record<string, unknown> | null)?.full_name,
    );
    if (!name) continue;
    // A party listed on both the agreement and a schedule shouldn't produce two
    // co-person cards.
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ full_name: name });
  }

  return out;
}

function normalizeAgents(raw: unknown): ExtractedAgent[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtractedAgent[] = [];

  for (const entry of raw) {
    const source = (entry ?? {}) as Record<string, unknown>;
    const fullName = normalizePersonName(source.full_name);
    const brokerage = asString(source.brokerage);
    // An entry with neither a person nor a brokerage carries nothing usable.
    if (!fullName && !brokerage) continue;

    const role = asString(source.role)?.toLowerCase();
    out.push({
      full_name: fullName,
      brokerage,
      role:
        role === "listing" || role === "cooperating"
          ? role
          : "unknown",
      email: asString(source.email),
      phone: asString(source.phone),
    });
  }

  return out;
}

/**
 * Defensively turn whatever the model returned into an ApsExtractionResult.
 *
 * Never throws: a malformed or partial response degrades to a result with
 * nothing in it, which the form treats exactly like "couldn't read the file".
 */
export function parseApsExtraction(raw: unknown): ApsExtractionResult {
  const source = (raw ?? {}) as Record<string, unknown>;

  return {
    is_aps: source.is_aps === true,
    purchase_price: normalizeValue(source.purchase_price, (v) =>
      normalizeAmount(v, { min: MIN_PRICE, max: MAX_PRICE }),
    ),
    deposit: normalizeValue(source.deposit, (v) =>
      normalizeAmount(v, { min: 1, max: MAX_DEPOSIT }),
    ),
    closing_date: normalizeValue(source.closing_date, normalizeIsoDate),
    property_address: normalizeAddress(source.property_address),
    buyers: normalizeParties(source.buyers),
    sellers: normalizeParties(source.sellers),
    agents: normalizeAgents(source.agents),
    reason: asString(source.reason) ?? "",
  };
}

/**
 * True when a result is worth showing the client. An APS we couldn't pull a
 * single usable field out of is reported as "we couldn't read it", not as a
 * success with an empty form.
 */
export function hasAnyExtractedValue(result: ApsExtractionResult): boolean {
  const address = result.property_address;
  return Boolean(
    result.purchase_price.value ||
      result.deposit.value ||
      result.closing_date.value ||
      address.street ||
      address.city ||
      address.postal_code ||
      result.buyers.length ||
      result.sellers.length ||
      result.agents.length,
  );
}

/** How many fields a read actually produced — used for the status line copy. */
export function countExtractedValues(result: ApsExtractionResult): number {
  const address = result.property_address;
  const singles = [
    result.purchase_price.value,
    result.deposit.value,
    result.closing_date.value,
    address.street,
    address.unit,
    address.city,
    address.postal_code,
  ].filter(Boolean).length;

  return (
    singles + result.buyers.length + result.sellers.length + result.agents.length
  );
}
