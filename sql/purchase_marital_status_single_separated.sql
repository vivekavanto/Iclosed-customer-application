-- Purchase-side Marital Status collapses the two "Separated with / with no
-- formal separation agreement" options into a single "Separated".
--
-- Sale keeps both options — the distinction still matters there.
--
-- Idempotent: both old separated values AND the new one are stripped before
-- "Separated" is appended, so re-running cannot duplicate it. The other
-- options are carried through untouched rather than re-listed, so anything
-- prod has that dev doesn't survives.

BEGIN;

-- 1. The options on the Purchase "Personal Information" template.
UPDATE task_form_fields f
SET options = (
      SELECT coalesce(jsonb_agg(o ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(f.options) WITH ORDINALITY AS e(o, ord)
      WHERE o->>'value' NOT IN ('separated_formal', 'separated_no_formal', 'separated')
    ) || '[{"label":"Separated","value":"separated"}]'::jsonb
WHERE f.label ILIKE '%marital%'
  AND f.task_template_id IN (
        SELECT t.id FROM task_templates t
        WHERE t.name ILIKE '%personal information%'
          AND t.lead_type = 'Purchase'
          AND t.is_deleted = false
      );

-- 2. Answers already saved on Purchase deals. Without this they hold a value
--    the dropdown no longer offers, so the field renders blank when a client
--    reopens the task. Both old values mean "Separated", so the mapping is
--    lossless for Purchase.
UPDATE task_responses r
SET value = 'separated'
WHERE r.value IN ('separated_formal', 'separated_no_formal')
  AND r.field_label ILIKE '%marital%'
  AND EXISTS (
        SELECT 1
        FROM tasks tk
        JOIN task_templates t ON t.id = tk.task_template_id
        WHERE tk.id = r.task_id
          AND t.lead_type = 'Purchase'
          AND t.name ILIKE '%personal information%'
      );

COMMIT;

-- Verify — Purchase should list 5 options ending in Separated, Sale still 6:
-- SELECT t.name, t.lead_type, f.options
-- FROM task_form_fields f
-- JOIN task_templates t ON t.id = f.task_template_id
-- WHERE f.label ILIKE '%marital%' AND t.is_deleted = false
-- ORDER BY t.lead_type;
