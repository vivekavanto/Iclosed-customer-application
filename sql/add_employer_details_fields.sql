-- Employer details on Purchase Personal Information: name, address, phone.
-- Adds name + address above the existing employer phone and relabels it.
-- Deploy the app code FIRST so the phone autofill ignores the new name field.
-- Idempotent.

DO $$
DECLARE
  tpl        record;
  phone_id   uuid;
  anchor_idx integer;
  name_label constant text := 'Employer or business name';
  addr_label constant text := 'Business address';
BEGIN
  FOR tpl IN
    SELECT id, name
    FROM task_templates
    WHERE name ILIKE '%personal information%'
      AND lower(trim(lead_type)) = 'purchase'
      AND is_deleted = false
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM task_form_fields
      WHERE task_template_id = tpl.id AND label = name_label
    );

    SELECT id, order_index INTO phone_id, anchor_idx
    FROM task_form_fields
    WHERE task_template_id = tpl.id
      AND (label ILIKE '%employer%' OR (label ILIKE '%business%' AND label ILIKE '%phone%'))
    ORDER BY order_index
    LIMIT 1;

    -- No phone field: go straight after Occupation instead.
    IF anchor_idx IS NULL THEN
      SELECT order_index + 1 INTO anchor_idx
      FROM task_form_fields
      WHERE task_template_id = tpl.id AND label ILIKE '%occupation%'
      ORDER BY order_index
      LIMIT 1;
    END IF;

    IF anchor_idx IS NULL THEN
      RAISE NOTICE 'Skipped % : no employer phone or occupation field', tpl.name;
      CONTINUE;
    END IF;

    -- Free two slots at the anchor; the phone field moves down with the rest.
    UPDATE task_form_fields
    SET order_index = order_index + 2
    WHERE task_template_id = tpl.id
      AND order_index >= anchor_idx;

    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options)
    VALUES
      (tpl.id, 'text', name_label, NULL, false, anchor_idx,
       '{"hint":"Use the same details you gave your mortgage broker or lender, if applicable."}'::jsonb),
      (tpl.id, 'text', addr_label, NULL, false, anchor_idx + 1, NULL);

    IF phone_id IS NOT NULL THEN
      UPDATE task_form_fields SET label = 'Business phone number' WHERE id = phone_id;
    END IF;

    RAISE NOTICE 'Added employer details to % at order_index %', tpl.name, anchor_idx;
  END LOOP;
END $$;

-- Verify:
SELECT t.name, f.order_index, f.field_type, f.required, f.label, f.options
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE t.name ILIKE '%personal information%'
  AND lower(trim(t.lead_type)) = 'purchase'
  AND t.is_deleted = false
ORDER BY t.name, f.order_index;
