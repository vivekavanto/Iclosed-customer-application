-- Undoes move_hold_title_to_own_task.sql: the fields go back onto Personal
-- Information at their old positions, the original answers are restored from
-- hold_title_backup_responses, and the new task + template are soft-deleted.
-- Answers given on the new task after the move are NOT carried back.

BEGIN;

DO $$
DECLARE
  ht_id task_templates.id%TYPE;
BEGIN
  SELECT id INTO ht_id
  FROM task_templates
  WHERE name = 'How Will You Hold Title?'
    AND lower(trim(lead_type)) = 'purchase'
    AND is_deleted = false
  LIMIT 1;

  IF ht_id IS NULL THEN
    RAISE NOTICE 'No hold-title template found — nothing to roll back.';
    RETURN;
  END IF;

  UPDATE task_form_fields f
  SET task_template_id = b.task_template_id,
      order_index = b.order_index
  FROM hold_title_backup_fields b
  WHERE f.id = b.id;

  DELETE FROM task_responses
  WHERE task_id IN (SELECT id FROM tasks WHERE task_template_id = ht_id);

  INSERT INTO task_responses
  SELECT b.* FROM hold_title_backup_responses b
  WHERE NOT EXISTS (SELECT 1 FROM task_responses r WHERE r.id = b.id);

  UPDATE tasks SET is_deleted = true WHERE task_template_id = ht_id;
  UPDATE task_templates SET is_deleted = true WHERE id = ht_id;
END $$;

COMMIT;

SELECT t.name, f.order_index, f.field_type, f.label
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE f.id IN (SELECT id FROM hold_title_backup_fields)
ORDER BY f.order_index;
