// Portal-side resolution of the closing-cost rate schedule.
//
// The admin app owns this configuration (src/lib/closingCostConfig.ts there);
// the portal only ever READS it, and only to power the client's what-if
// calculator. So this is a deliberately small mirror rather than a copy of the
// admin module — no writes, no defaults management, no statement types.
//
// ── Which rates a client sees ───────────────────────────────────────────
// When the firm has issued an estimate, its FROZEN `rates_used` snapshot is
// authoritative: the client's what-if numbers must be built from the same fee
// schedule they were quoted, not from whatever the firm's standard is today.
// Only when no estimate exists yet do we fall back to the live configuration.
//
// ── The firm / shared split ─────────────────────────────────────────────
// `closing_cost_config` holds one row per firm (its own legal & admin fees plus
// its letterhead); `closing_cost_shared_rates` holds the statutory and
// third-party values every firm shares — land transfer tax brackets, the HST
// rate, the rebate caps, the registration tariff and the FCT premium formula.
// The rule is HST: if HST is charged on it, it is the firm's own charge.
//
// Shared is overlaid LAST so it stays the single source of truth even while
// `closing_cost_config` still carries its legacy copies of those columns.

import supabaseAdmin from "./supabaseAdmin";
import { DEFAULT_RATES, type ClosingCostRates, ratesFromConfigRow } from "./closingCosts";
import {
  FIRM_KEYS,
  STATEMENT_TYPE_KEYS,
  defaultFirmRow,
  defaultSharedRow,
  defaultStatementType,
  statementTypeFromRow,
  toStatementTypeKey,
  type StatementTypeConfig,
} from "./closingCostSettings";

/** Owned by `closing_cost_shared_rates`; identical for every firm. */
const SHARED_RATE_COLUMNS = [
  "reg_transfer",
  "reg_mortgage",
  "hst_rate",
  "rebate_ontario_max",
  "rebate_toronto_max",
  "title_premium_base",
  "title_premium_rate",
  "title_premium_min",
  "ltt_tiers",
  "mltt_tiers",
] as const;

export interface ResolvedRates {
  rates: ClosingCostRates;
  /** True when these came from an issued estimate's frozen snapshot. */
  fromIssuedEstimate: boolean;
  /** The firm whose fee schedule these are, when known. */
  firmKey: string | null;
}

/**
 * The live configuration, merged firm + shared.
 *
 * Tolerant by design: this runs against a database the ADMIN app migrates, so
 * a table or column that does not exist yet must degrade to the code defaults
 * rather than break the client's page.
 */
async function readLiveRates(preferredFirmKey?: string | null): Promise<{
  row: Record<string, unknown>;
  firmKey: string | null;
}> {
  const merged: Record<string, unknown> = {};
  let firmKey: string | null = preferredFirmKey ?? null;

  // Shared first — it also tells us which firm is the configured default.
  let shared: Record<string, unknown> | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("closing_cost_shared_rates")
      .select("*")
      .eq("is_active", true)
      .eq("is_deleted", false)
      .maybeSingle();
    shared = data ?? null;
  } catch {
    // Table not migrated yet — fall through to defaults.
  }

  if (!firmKey && shared?.default_firm_key) {
    firmKey = String(shared.default_firm_key);
  }

  // The firm's own fee schedule.
  try {
    const query = supabaseAdmin
      .from("closing_cost_config")
      .select("*")
      .eq("is_deleted", false);
    const { data } = firmKey
      ? await query.eq("firm_key", firmKey).maybeSingle()
      : await query.eq("is_active", true).limit(1).maybeSingle();
    if (data) {
      Object.assign(merged, data);
      if (data.firm_key) firmKey = String(data.firm_key);
    }
  } catch {
    // Pre-migration (no firm_key column) or unreadable — defaults apply.
  }

  // Shared wins, by explicit key so its own id/label can't clobber the firm's.
  if (shared) {
    for (const key of SHARED_RATE_COLUMNS) {
      const value = shared[key];
      if (value !== null && value !== undefined) merged[key] = value;
    }
  }

  return { row: merged, firmKey };
}

/**
 * The rate schedule to build the client's what-if statement from.
 *
 * `issuedRatesUsed` is the estimate's frozen `rates_used` jsonb. It is already
 * snake_case (written by ratesToSnapshot), so it feeds ratesFromConfigRow
 * directly.
 */
export async function resolveClientRates(
  issuedRatesUsed: unknown,
  firmKey?: string | null,
): Promise<ResolvedRates> {
  if (issuedRatesUsed && typeof issuedRatesUsed === "object") {
    const snapshot = issuedRatesUsed as Record<string, unknown>;
    // Guard against an empty {} default so a half-written row still calculates.
    if (Object.keys(snapshot).length > 0) {
      return {
        rates: ratesFromConfigRow(snapshot),
        fromIssuedEstimate: true,
        firmKey: firmKey ?? null,
      };
    }
  }

  try {
    const { row, firmKey: resolvedFirm } = await readLiveRates(firmKey);
    return {
      rates: ratesFromConfigRow(row),
      fromIssuedEstimate: false,
      firmKey: resolvedFirm,
    };
  } catch {
    return { rates: DEFAULT_RATES, fromIssuedEstimate: false, firmKey: null };
  }
}

// ─────────────────────── firm & statement-type lists ───────────────────────

export interface FirmOption {
  firm_key: string;
  label: string;
  firm_badge: string | null;
  brand_color: string | null;
  /** The firm's own fee schedule, merged with the shared statutory values. */
  rates: ClosingCostRates;
}

/**
 * The code-default firms, used when nothing is configured in the database.
 *
 * Without this the picker silently disappears on any environment where the
 * closing-cost migrations have not been run — which reads as a missing feature
 * rather than as missing configuration. Deactivating a firm is a deliberate
 * choice made in admin settings; having no rows at all is not.
 */
function fallbackFirmOptions(): FirmOption[] {
  const shared = defaultSharedRow();
  return FIRM_KEYS.map((key) => {
    const row = defaultFirmRow(key);
    return {
      firm_key: key,
      label: String(row.label ?? key),
      firm_badge: (row.firm_badge as string | null) ?? null,
      brand_color: (row.brand_color as string | null) ?? null,
      rates: ratesFromConfigRow({ ...row, ...shared }),
    };
  });
}

/**
 * Every firm a client may pick, each with its own resolved rate schedule.
 *
 * Only ACTIVE firms — an inactive one is not something the firm offers, so it
 * must not appear as a choice. Falls back to the code defaults when the
 * configuration has not been migrated yet.
 */
export async function readFirmOptions(): Promise<FirmOption[]> {
  let shared: Record<string, unknown> | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("closing_cost_shared_rates")
      .select("*")
      .eq("is_active", true)
      .eq("is_deleted", false)
      .maybeSingle();
    shared = data ?? null;
  } catch {
    shared = null;
  }

  let firms: Record<string, unknown>[] = [];
  try {
    const { data } = await supabaseAdmin
      .from("closing_cost_config")
      .select("*")
      .eq("is_active", true)
      .eq("is_deleted", false)
      .order("sort_order", { ascending: true });
    firms = (data ?? []) as Record<string, unknown>[];
  } catch {
    return fallbackFirmOptions();
  }

  const usable = firms.filter((row) => Boolean(row.firm_key));
  // Nothing configured at all — not the same thing as every firm being switched
  // off, so offer the built-in ones rather than an empty picker.
  if (usable.length === 0) return fallbackFirmOptions();

  return usable
    .map((row) => {
      const merged: Record<string, unknown> = { ...row };
      // Shared last and by explicit key, so a firm row's stale legacy copies of
      // the statutory columns can never beat the shared source of truth.
      if (shared) {
        for (const key of SHARED_RATE_COLUMNS) {
          const value = shared[key];
          if (value !== null && value !== undefined) merged[key] = value;
        }
      }
      return {
        firm_key: String(row.firm_key),
        label: String(row.label ?? row.firm_key),
        firm_badge: (row.firm_badge as string | null) ?? null,
        brand_color: (row.brand_color as string | null) ?? null,
        rates: ratesFromConfigRow(merged),
      };
    });
}

/**
 * The client-facing wording for both statement types.
 *
 * Always returns both keys, filling any gap from the code defaults — which are
 * the strings the app printed before the wording became editable, so nothing a
 * client reads changes until staff deliberately edit it.
 */
export async function readStatementTypeOptions(): Promise<StatementTypeConfig[]> {
  let rows: Record<string, unknown>[] = [];
  try {
    const { data } = await supabaseAdmin
      .from("closing_cost_statement_types")
      .select("*")
      .eq("is_deleted", false)
      .order("sort_order", { ascending: true });
    rows = (data ?? []) as Record<string, unknown>[];
  } catch {
    rows = [];
  }

  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = String(row.type_key ?? "");
    if (key) byKey.set(key, row);
  }

  return STATEMENT_TYPE_KEYS.map((key) =>
    statementTypeFromRow(byKey.get(key) ?? null, key),
  );
}

/** One statement type's wording, resolved server-side for the PDF. */
export async function readStatementTypeOption(
  key: unknown,
): Promise<StatementTypeConfig> {
  const resolved = toStatementTypeKey(key);
  const all = await readStatementTypeOptions();
  return all.find((t) => t.type_key === resolved) ?? defaultStatementType(resolved);
}
