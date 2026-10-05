-- "Confirm your property details" as the first Purchase and Sale task. Idempotent.

DO $$
DECLARE
  lt text;
BEGIN
  FOREACH lt IN ARRAY ARRAY['Purchase', 'Sale'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM task_templates
      WHERE name = 'Confirm your property details' AND lead_type = lt AND is_deleted = false
    ) THEN
      INSERT INTO task_templates
        (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
         is_deleted, is_default, stage_template_id, is_shared, activation_required)
      SELECT lt, 'Client', 'Confirm your property details', COALESCE(MIN(order_index), 1) - 1,
             NULL, false, false, true, NULL, true, false
      FROM task_templates
      WHERE lead_type = lt AND is_deleted = false;
    END IF;
  END LOOP;
END $$;
