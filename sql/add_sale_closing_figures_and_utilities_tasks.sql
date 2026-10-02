-- Sale closing-figures and utilities tasks. Idempotent.

DO $$
DECLARE
  last_order task_templates.order_index%TYPE;
BEGIN
  SELECT COALESCE(MAX(order_index), 0) INTO last_order
  FROM task_templates
  WHERE lead_type = 'Sale' AND is_deleted = false;

  -- Locked on the dashboard until every other to-do is done.
  IF NOT EXISTS (
    SELECT 1 FROM task_templates
    WHERE name = 'Review your closing figures' AND lead_type = 'Sale' AND is_deleted = false
  ) THEN
    last_order := last_order + 1;
    INSERT INTO task_templates
      (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
       is_deleted, is_default, stage_template_id, is_shared, activation_required)
    VALUES
      ('Sale', 'Client', 'Review your closing figures', last_order,
       NULL, false, false, true, NULL, true, false);
  END IF;

  -- Shown in the dashboard's "After closing" section.
  IF NOT EXISTS (
    SELECT 1 FROM task_templates
    WHERE name = 'Close or transfer your utilities' AND lead_type = 'Sale' AND is_deleted = false
  ) THEN
    last_order := last_order + 1;
    INSERT INTO task_templates
      (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
       is_deleted, is_default, stage_template_id, is_shared, activation_required)
    VALUES
      ('Sale', 'Client', 'Close or transfer your utilities', last_order,
       NULL, false, false, true, NULL, true, false);
  END IF;
END $$;
