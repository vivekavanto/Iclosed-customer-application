// Portal-side resolution of the closing-cost rate schedule.
//
// The admin app owns this configuration (src/lib/closingCostConfig.ts there);
// the portal only ever READS it, and only to power the client's what-if
// calculator. So this is a deliberately small mirror rather than a copy of the
// admin module — no writes, no defaults management, no statement types.
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
//
// ── No firm picker ──────────────────────────────────────────────────────
// A client's firm is fixed by their file and resolved server-side, so there is
// deliberately no "every firm a client may choose" reader here. See
// `clientEstimateContext.ts`, which owns that decision for every route.

import supabaseAdmin from "./supabaseAdmin";
import {
  // Which columns `closing_cost_shared_rates` owns is decided ONCE, in the twin
  // settings module. This file used to restate the list, which made it a third
  // copy that could silently fall behind — and did.
  SHARED_RATE_COLUMNS,
  STATEMENT_TYPE_KEYS,
  defaultStatementType,
  statementTypeFromRow,
  toStatementTypeKey,
  type StatementTypeConfig,
} from "./closingCostSettings";

/**
 * The live configuration for one firm, merged firm + shared, as ONE flat
 * snake_case row of the shape `ratesFromConfigRow` and `generateClosingCostPdf`
 * both already consume. It therefore carries the letterhead columns and the
 * firm's `property_tax_default` alongside the rates, so a caller that needs all
 * three reads the database once.
 *
 * Tolerant by design: this runs against a database the ADMIN app migrates, so
 * a table or column that does not exist yet must degrade to the code defaults
 * rather than break the client's page.
 */
export async function readFirmAndSharedRow(preferredFirmKey?: string | null): Promise<{
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

// ─────────────────────────── statement-type copy ───────────────────────────

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
