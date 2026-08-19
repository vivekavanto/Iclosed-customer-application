-- Purchase-side Personal Information gets a "Mail address same as purchase
-- property" checkbox above the mail-forwarding address block.
--
-- Ticked (the default), the client sees the purchase property address instead
-- of the four address fields, and those fields are submitted with the
-- property's own street / unit / city / postal code. Unticked, the address
-- form appears exactly as it does today.
--
-- Sale is untouched — a seller has no purchase property to forward mail to.
--
-- Deploy the app code FIRST: older code renders the checkbox as a plain
-- unstyled tickbox with no address under it and never hides the fields.
--
-- Idempotent — the NOT EXISTS guard covers both the shift and the insert.

BEGIN;

-- Free up order_index 2, directly under Phone Number.
UPDATE task_form_fields f
SET order_index = f.order_index + 1
WHERE f.task_template_id IN (
        SELECT t.id FROM task_templates t
        WHERE t.name ILIKE '%personal information%'
          AND t.lead_type = 'Purchase'
          AND t.is_deleted = false
      )
  AND f.order_index >= 2
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = f.task_template_id
          AND x.label = 'Mail address same as purchase property'
      );

-- The checkbox itself. The app finds it by label, so keep the wording.
INSERT INTO task_form_fields
  (task_template_id, field_type, label, placeholder, required, order_index, options)
SELECT t.id, 'checkbox', 'Mail address same as purchase property', NULL, false, 2, NULL
FROM task_templates t
WHERE t.name ILIKE '%personal information%'
  AND t.lead_type = 'Purchase'
  AND t.is_deleted = false
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = t.id
          AND x.label = 'Mail address same as purchase property'
      );

COMMIT;

-- Verify — the checkbox should sit at 2, with Street Address right after it:
-- SELECT t.name, t.lead_type, f.order_index, f.field_type, f.required, f.label
-- FROM task_form_fields f
-- JOIN task_templates t ON t.id = f.task_template_id
-- WHERE t.name ILIKE '%personal information%'
--   AND t.lead_type = 'Purchase'
--   AND t.is_deleted = false
-- ORDER BY f.order_index;
