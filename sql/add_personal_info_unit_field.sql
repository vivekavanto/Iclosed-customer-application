-- Adds an optional "Apartment/Unit Number" field to the Personal Information
-- task, positioned between "Street Address" and "City".
--
-- Applies to every live personal-information template (Purchase + Sale).
-- Soft-deleted templates (is_deleted = true) are skipped.
--
-- Apply once in the Supabase SQL editor. Idempotent — re-running makes no
-- further change because of the NOT EXISTS guard.

BEGIN;

-- Shift City, Postal Code and everything after it down one slot to free order 3.
UPDATE task_form_fields f
SET order_index = f.order_index + 1
WHERE f.task_template_id IN (
        SELECT t.id FROM task_templates t
        WHERE t.name ILIKE '%personal information%' AND t.is_deleted = false
      )
  AND f.order_index >= 3
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = f.task_template_id
          AND x.label = 'Apartment/Unit Number (Optional)'
      );

INSERT INTO task_form_fields
  (task_template_id, field_type, label, placeholder, required, order_index, options)
SELECT t.id, 'text', 'Apartment/Unit Number (Optional)', 'e.g. 4B, #12, PH-2', false, 3, NULL
FROM task_templates t
WHERE t.name ILIKE '%personal information%'
  AND t.is_deleted = false
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = t.id
          AND x.label = 'Apartment/Unit Number (Optional)'
      );

COMMIT;

-- Verify:
-- SELECT t.name, t.lead_type, f.order_index, f.field_type, f.required, f.label
-- FROM task_form_fields f
-- JOIN task_templates t ON t.id = f.task_template_id
-- WHERE t.name ILIKE '%personal information%' AND t.is_deleted = false
-- ORDER BY t.name, f.order_index;
