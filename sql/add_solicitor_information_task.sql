-- Purchase "Solicitor Information" task, placed after Mortgage Representative Details. Idempotent.

DO $$
DECLARE
  anchor  task_templates%ROWTYPE;
  new_id  task_templates.id%TYPE;
BEGIN
  IF EXISTS (
    SELECT 1 FROM task_templates
    WHERE name = 'Solicitor Information' AND lead_type = 'Purchase' AND is_deleted = false
  ) THEN
    RAISE NOTICE 'Solicitor Information already exists.';
    RETURN;
  END IF;

  SELECT * INTO anchor
  FROM task_templates
  WHERE name ILIKE '%mortgage representative%'
    AND lead_type = 'Purchase'
    AND is_deleted = false
  ORDER BY order_index
  LIMIT 1;

  IF anchor.id IS NULL THEN
    RAISE EXCEPTION 'Purchase "Mortgage Representative Details" template not found.';
  END IF;

  UPDATE task_templates
  SET order_index = order_index + 1
  WHERE lead_type = 'Purchase' AND is_deleted = false AND order_index > anchor.order_index;

  -- is_default: /api/tasks adds it to existing Purchase files on next load.
  INSERT INTO task_templates
    (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
     is_deleted, is_default, stage_template_id, is_shared, activation_required)
  VALUES
    ('Purchase', anchor.role_type, 'Solicitor Information', anchor.order_index + 1,
     anchor.deadline_rule, false, false, true, anchor.stage_template_id,
     anchor.is_shared, false)
  RETURNING id INTO new_id;

  INSERT INTO task_form_fields
    (task_template_id, field_type, label, placeholder, required, order_index, options)
  VALUES
    (new_id, 'checkbox',
     'I confirm I have sent my mortgage agent/lender the solicitor information above',
     NULL, true, 1, NULL);
END $$;

SELECT t.name, t.order_index, t.is_shared, t.role_type, f.field_type, f.required, f.label
FROM task_templates t
LEFT JOIN task_form_fields f ON f.task_template_id = t.id
WHERE t.lead_type = 'Purchase' AND t.is_deleted = false
  AND (t.name = 'Solicitor Information' OR t.name ILIKE '%mortgage representative%')
ORDER BY t.order_index;
