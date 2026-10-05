-- Sale personal info: retire the citizenship question, keeping saved answers. Idempotent.
UPDATE task_form_fields f
SET required = false,
    visible_when = '{"field_label":"Marital Status","equals":"__retired__"}'::jsonb
FROM task_templates t
WHERE f.task_template_id = t.id
  AND t.lead_type = 'Sale'
  AND t.name ILIKE '%personal information%'
  AND t.is_deleted = false
  AND f.label = 'What is your citizenship status?';
