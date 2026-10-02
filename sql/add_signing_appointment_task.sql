-- "Book your signing appointment" task, both sides. Idempotent.

DO $$
DECLARE
  lt     text;
  anchor task_templates%ROWTYPE;
BEGIN
  FOREACH lt IN ARRAY ARRAY['Purchase', 'Sale'] LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM task_templates
      WHERE name = 'Book your signing appointment' AND lead_type = lt AND is_deleted = false);

    SELECT * INTO anchor FROM task_templates
    WHERE lead_type = lt AND is_deleted = false
      AND name ILIKE CASE lt WHEN 'Purchase' THEN '%void cheque%' ELSE '%lockbox%' END
    ORDER BY order_index LIMIT 1;
    IF anchor.id IS NULL THEN
      RAISE EXCEPTION '% anchor template not found.', lt;
    END IF;

    UPDATE task_templates SET order_index = order_index + 1
    WHERE lead_type = lt AND is_deleted = false AND order_index > anchor.order_index;

    INSERT INTO task_templates
      (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
       is_deleted, is_default, stage_template_id, is_shared, activation_required)
    VALUES
      (lt, 'Client', 'Book your signing appointment', anchor.order_index + 1,
       NULL, false, false, true, NULL, true, false);
  END LOOP;
END $$;
