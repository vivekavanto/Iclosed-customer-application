import supabaseAdmin from "@/lib/supabaseAdmin";
import { normalizeEmailForStorage } from "@/lib/normalizeEmail";

/**
 * Whitespace-tolerant lookup of `leads` / `clients` rows by email.
 *
 * Mirrors the admin repo's `src/lib/emailLookup.ts` — both apps read the same
 * tables, so both need the same tolerance. Intake now trims on write and a
 * migration trimmed the rows that were already there, but a stored address can
 * still drift (a manual edit, an import, a non-breaking space out of a PDF), and
 * the failure mode is invisible: an exact match simply returns nothing and the
 * caller carries on as though the client did not exist. That is what silently
 * suppressed the referring agent's "your client just signed up" notification.
 */

/**
 * Case- and whitespace-insensitive comparison key. COMPARISON ONLY — never
 * store this: the local part of an address is case-sensitive per RFC 5321, so
 * lower-casing a stored value would be a change nobody asked for.
 */
function key(email: string | null | undefined): string {
  return (normalizeEmailForStorage(email) ?? "").toLowerCase();
}

/** True when two addresses are the same once whitespace and case are ignored. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = key(a);
  return left !== "" && left === key(b);
}

/**
 * Rows in `table` whose email matches `email`, ignoring surrounding whitespace.
 *
 * PostgREST cannot `btrim()` a column inside a filter, so this casts a wide net
 * (`%address%`) and settles it in JS. The pattern is not escaped and the net
 * deliberately over-matches — "foo@bar.com" also pulls in "foo@bar.com.au" —
 * because `sameEmail` throws those away afterwards. Read-only for that reason:
 * never feed this pattern straight into an UPDATE.
 */
export async function findRowsByEmail<T extends object>(
  table: "leads" | "clients",
  columns: string,
  email: string | null | undefined,
  opts: { limit?: number } = {},
): Promise<Array<T & { email?: string | null }>> {
  const wanted = key(email);
  if (!wanted) return [];

  const select = columns.includes("email") ? columns : `${columns}, email`;
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(select)
    .ilike("email", `%${wanted}%`)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (error) return [];
  const matches = ((data ?? []) as unknown as Array<T & { email?: string | null }>).filter(
    (row) => sameEmail(row.email, wanted),
  );

  // Already-clean rows rank first, newest-within-rank preserved.
  //
  // Widening the match can surface TWO rows where the old exact lookup could
  // only ever see one — a person with both "a@b.ca" and "a@b.ca " on file is a
  // duplicate record, and the stray space is usually how the duplicate came
  // about. Whichever row an existing login already resolved to must keep
  // winning, or this fix would quietly move someone onto their other record.
  // An exact `.eq()` could only ever have found the clean one, so that is the
  // one that stays in front; the loose match is a fallback, not a promotion.
  const clean = (row: { email?: string | null }) =>
    typeof row.email === "string" && row.email === row.email.trim();
  return [...matches.filter(clean), ...matches.filter((r) => !clean(r))];
}

/** The newest row in `table` matching `email`, or null. */
export async function findRowByEmail<T extends object>(
  table: "leads" | "clients",
  columns: string,
  email: string | null | undefined,
): Promise<(T & { email?: string | null }) | null> {
  const rows = await findRowsByEmail<T>(table, columns, email, { limit: 10 });
  return rows[0] ?? null;
}
