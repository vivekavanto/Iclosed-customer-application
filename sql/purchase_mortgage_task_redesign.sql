-- Purchase mortgage task per portal redesign. Idempotent.

DO $$
DECLARE
  tpl uuid;
  q   constant text := 'Are you getting a mortgage for this purchase?';
  yes jsonb;
BEGIN
  SELECT id INTO tpl FROM task_templates
  WHERE name = 'Mortgage Representative Details' AND lead_type = 'Purchase' AND is_deleted = false
  LIMIT 1;
  IF tpl IS NULL THEN
    RAISE EXCEPTION 'Purchase mortgage template not found.';
  END IF;
  yes := jsonb_build_object('field_label', q, 'equals', 'Yes');

  IF NOT EXISTS (SELECT 1 FROM task_form_fields WHERE task_template_id = tpl AND label = q) THEN
    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options)
    VALUES
      (tpl, 'radio', q, NULL, true, 0, '[{"label":"Yes","value":"Yes"},{"label":"No","value":"No"}]'::jsonb),
      (tpl, 'text', 'Mortgage amount', '728,000', true, 1, '{"prefix":"$"}'::jsonb);
    UPDATE task_form_fields SET visible_when = yes
    WHERE task_template_id = tpl AND label = 'Mortgage amount';
  END IF;

  -- Shown on Yes; avoid the "Email" prefill label.
  UPDATE task_form_fields
  SET label = 'Lender or brokerage', placeholder = 'e.g. RBC', required = true, order_index = 2,
      options = '{"half":true}'::jsonb, visible_when = yes
  WHERE task_template_id = tpl AND label IN ('Company Name', 'Lender or brokerage');
  UPDATE task_form_fields
  SET label = 'Representative name', placeholder = 'Broker or bank rep', required = true, order_index = 3,
      options = '{"half":true}'::jsonb, visible_when = yes
  WHERE task_template_id = tpl AND label IN ('Mortgage Representative/Agent Name', 'Representative name');
  UPDATE task_form_fields
  SET label = 'Representative phone', placeholder = '(416) 555-1234', required = false, order_index = 4,
      options = '{"half":true,"optional":true}'::jsonb, visible_when = yes
  WHERE task_template_id = tpl AND label IN ('Mortgage Representative/Agent Phone Number', 'Representative phone');
  UPDATE task_form_fields
  SET label = 'Representative email', placeholder = 'name@lender.com', required = false, order_index = 5,
      options = '{"half":true,"optional":true}'::jsonb, visible_when = yes
  WHERE task_template_id = tpl AND label IN ('Mortgage Representative/Agent Email', 'Representative email');
  UPDATE task_form_fields SET order_index = 6, visible_when = yes
  WHERE task_template_id = tpl AND label = 'Mortgage Commitment Confirmation';
END $$;
