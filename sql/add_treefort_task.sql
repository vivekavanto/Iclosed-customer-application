-- "Treefort ID Verification" templates (Purchase + Sale), after Identification. Not default: added per party on virtual signing (src/lib/treefortTask.ts). Idempotent.

DO $$
DECLARE
  lt      text;
  anchor  task_templates%ROWTYPE;
  new_id  task_templates.id%TYPE;
BEGIN
  FOREACH lt IN ARRAY ARRAY['Purchase', 'Sale'] LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM task_templates
      WHERE name = 'Treefort ID Verification' AND lead_type = lt AND is_deleted = false);

    SELECT * INTO anchor
    FROM task_templates
    WHERE name ILIKE '%identif%' AND lead_type = lt AND is_deleted = false
    ORDER BY order_index
    LIMIT 1;
    IF anchor.id IS NULL THEN
      RAISE NOTICE 'Skipped %: no Identification template.', lt;
      CONTINUE;
    END IF;

    UPDATE task_templates
    SET order_index = order_index + 1
    WHERE lead_type = lt AND is_deleted = false AND order_index > anchor.order_index;

    INSERT INTO task_templates
      (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
       is_deleted, is_default, stage_template_id, is_shared, activation_required)
    VALUES
      (lt, anchor.role_type, 'Treefort ID Verification', anchor.order_index + 1,
       anchor.deadline_rule, false, false, false, anchor.stage_template_id, false, false)
    RETURNING id INTO new_id;

    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options)
    VALUES
      (new_id, 'checkbox', 'I confirm I have completed the Treefort ID verification', NULL, true, 1, NULL);

    RAISE NOTICE 'Added % Treefort template after "%".', lt, anchor.name;
  END LOOP;
END $$;

SELECT t.lead_type, t.order_index, t.name, t.is_default, t.is_shared, f.label
FROM task_templates t
LEFT JOIN task_form_fields f ON f.task_template_id = t.id
WHERE t.is_deleted = false AND (t.name ILIKE '%treefort%' OR t.name ILIKE '%identif%')
ORDER BY t.lead_type, t.order_index;
