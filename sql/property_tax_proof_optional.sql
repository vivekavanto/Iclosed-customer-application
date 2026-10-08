-- Sale property tax: proof of payment upload is optional. Idempotent.
UPDATE task_form_fields f
SET required = false
FROM task_templates t
WHERE f.task_template_id = t.id
  AND t.lead_type = 'Sale'
  AND t.is_deleted = false
  AND t.name ILIKE '%property tax%'
  AND f.label = 'Proof of Payment';
