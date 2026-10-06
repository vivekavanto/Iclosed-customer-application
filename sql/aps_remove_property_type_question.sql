-- Retire the APS property type question; intake asks it now. Idempotent.
UPDATE task_form_fields f
SET required = false,
    visible_when = '{"field_label":"What type of property is this?","equals":"__retired__"}'::jsonb
FROM task_templates t
WHERE f.task_template_id = t.id
  AND t.name ILIKE '%agreement of purchase%'
  AND t.lead_type = 'Purchase'
  AND (f.label = 'What type of property is this?' OR f.label LIKE 'Condos need a status certificate%');
