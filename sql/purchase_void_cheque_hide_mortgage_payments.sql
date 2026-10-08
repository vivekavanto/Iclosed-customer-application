-- Hide void cheque mortgage-payments rows. Idempotent.

UPDATE task_form_fields f
SET required = false,
    visible_when = '{"field_label":"Whose account should be used for the mortgage payments?","equals":"__retired__"}'::jsonb
FROM task_templates t
WHERE t.id = f.task_template_id
  AND t.name ILIKE '%void cheque%' AND t.lead_type = 'Purchase' AND t.is_deleted = false
  AND f.label IN ('Mortgage Payments', 'Whose account should be used for the mortgage payments?');
