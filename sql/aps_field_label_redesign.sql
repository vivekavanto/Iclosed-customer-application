-- APS upload field label and slot label per portal redesign. Idempotent.
UPDATE task_form_fields f
SET label = 'Agreement of Purchase and Sale and Amendments',
    options = COALESCE(f.options, '{}'::jsonb) || '{"slot_label":"Agreement of Purchase and Sale"}'::jsonb
FROM task_templates t
WHERE f.task_template_id = t.id
  AND t.name ILIKE '%agreement of purchase%'
  AND t.lead_type IN ('Purchase', 'Sale')
  AND t.is_deleted = false
  AND f.field_type = 'file';
