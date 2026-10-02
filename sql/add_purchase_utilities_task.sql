-- Purchase after-closing "Set up your utilities" task. Idempotent.

INSERT INTO task_templates
  (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
   is_deleted, is_default, stage_template_id, is_shared, activation_required)
SELECT 'Purchase', 'Client', 'Set up your utilities', COALESCE(MAX(order_index), 0) + 1,
       NULL, false, false, true, NULL, true, false
FROM task_templates
WHERE lead_type = 'Purchase' AND is_deleted = false
HAVING NOT EXISTS (
  SELECT 1 FROM task_templates
  WHERE name = 'Set up your utilities' AND lead_type = 'Purchase' AND is_deleted = false
);
