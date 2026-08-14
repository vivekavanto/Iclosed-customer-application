-- Source of funds becomes a normal single-line text field, matching the other
-- questions. Drops the width override, which only applied to textareas.

BEGIN;

UPDATE task_form_fields
SET field_type = 'text',
    options    = options - 'width'
WHERE label ILIKE '%source of funds%'
  AND field_type = 'textarea';

COMMIT;

-- Verify: field_type should read "text" and width should be gone.
SELECT t.name, t.lead_type, f.order_index, f.field_type, f.label, f.options
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE f.label ILIKE '%source of funds%';
