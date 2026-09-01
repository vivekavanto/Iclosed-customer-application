/**
 * Conditional visibility for DB-driven task form fields.
 *
 * A field's `options` JSON can carry a `visible_when` rule that hides it until
 * another field is answered a certain way. Shapes (set in the DB, never
 * hardcoded here):
 *
 *   { "visible_when": { "field_label": "<parent>", "equals": "<value>" } }
 *   { "visible_when": { "field_label": "<parent>", "equals_any": [...] } }
 *   { "visible_when": { "all": [ <clause>, <clause> ] } }   // every clause must match
 *
 * Shared by PersonalInfoTaskDrawer and DynamicTaskDrawer so the two can't drift.
 */

export type VisibleWhenClause = { field_label: string; values: string[] };

type RawClause = {
  field_label?: string;
  equals?: string;
  equals_any?: unknown;
};

type RawVisibleWhen = RawClause & { all?: RawClause[] };

/** Returns one entry per clause, or null when the field carries no usable rule. */
export function getVisibleWhen(opts: unknown): VisibleWhenClause[] | null {
  if (
    !opts ||
    typeof opts !== "object" ||
    Array.isArray(opts) ||
    !("visible_when" in opts)
  ) {
    return null;
  }
  const vw = (opts as { visible_when?: RawVisibleWhen }).visible_when;
  if (!vw) return null;
  const raw = Array.isArray(vw.all) ? vw.all : [vw];
  const clauses: VisibleWhenClause[] = [];
  for (const c of raw) {
    if (!c?.field_label) continue;
    const values = Array.isArray(c.equals_any)
      ? c.equals_any.map((v) => String(v))
      : c.equals != null
        ? [String(c.equals)]
        : [];
    if (values.length === 0) continue;
    clauses.push({ field_label: String(c.field_label), values });
  }
  return clauses.length > 0 ? clauses : null;
}

/**
 * Whether a field's rule is currently satisfied. Every clause must match, so a
 * two-clause rule is a true AND. Parents are matched by label and values
 * compared case-insensitively. Fails open: no rule, or a parent that isn't on
 * the form, leaves the field visible.
 */
export function isVisibleByRules(
  opts: unknown,
  fields: { id: string; label: string }[],
  values: Record<string, string>,
): boolean {
  const rules = getVisibleWhen(opts);
  if (!rules) return true;
  return rules.every((rule) => {
    const parent = fields.find(
      (f) => f.label.trim().toLowerCase() === rule.field_label.trim().toLowerCase(),
    );
    if (!parent) return true;
    const current = (values[parent.id] ?? "").trim().toLowerCase();
    return rule.values.some((v) => v.trim().toLowerCase() === current);
  });
}
