-- Move "Is this purchase property your primary residence or an investment
-- property?" to directly BEFORE "Marital Status" (was after). The spouse
-- question + consent notice (added by add_spouse_name_field.sql) stay
-- attached right after Marital Status — only the residence question moves.
-- Re-sequences order_index for the whole template so no gaps/dupes remain.
-- Idempotent: re-running keeps the same relative order.

DO $$
DECLARE
  tpl          record;
  marital_idx  integer;
BEGIN
  FOR tpl IN
    SELECT id, name, lead_type
    FROM task_templates
    WHERE name ILIKE '%personal information%'
      AND lead_type IN ('Purchase', 'Sale')
      AND is_deleted = false
  LOOP
    SELECT order_index INTO marital_idx
    FROM task_form_fields
    WHERE task_template_id = tpl.id AND label ILIKE '%marital%'
    ORDER BY order_index
    LIMIT 1;

    IF marital_idx IS NULL OR NOT EXISTS (
      SELECT 1 FROM task_form_fields
      WHERE task_template_id = tpl.id AND label ILIKE '%primary residence%'
    ) THEN
      RAISE NOTICE 'Skipped % (%): marital or residence question not found', tpl.name, tpl.lead_type;
      CONTINUE;
    END IF;

    WITH ordered AS (
      SELECT
        id,
        CASE WHEN label ILIKE '%primary residence%' THEN marital_idx - 0.5 ELSE order_index END AS sort_key
      FROM task_form_fields
      WHERE task_template_id = tpl.id
    ),
    renumbered AS (
      SELECT id, row_number() OVER (ORDER BY sort_key) AS new_idx
      FROM ordered
    )
    UPDATE task_form_fields f
    SET order_index = r.new_idx
    FROM renumbered r
    WHERE f.id = r.id;

    RAISE NOTICE 'Reordered % (%)', tpl.name, tpl.lead_type;
  END LOOP;
END $$;

-- Verify
SELECT t.lead_type, f.order_index, f.field_type, f.label
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE t.name ILIKE '%personal information%'
  AND t.is_deleted = false
ORDER BY t.lead_type, f.order_index;
