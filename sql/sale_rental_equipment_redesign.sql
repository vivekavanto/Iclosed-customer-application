-- Sale rental equipment per portal redesign. Idempotent.
DO $$
DECLARE
  tpl uuid;
  q constant text := 'Do you have any rental equipment?';
  retired constant jsonb := '{"field_label":"Do you have any rental equipment?","equals":"__retired__"}';
BEGIN
  SELECT id INTO tpl FROM task_templates
  WHERE name ILIKE '%rental equipment%' AND lead_type = 'Sale' AND is_deleted = false LIMIT 1;
  IF tpl IS NULL THEN
    RAISE EXCEPTION 'Sale rental equipment template not found.';
  END IF;

  -- Old questions kept for saved answers.
  UPDATE task_form_fields SET required = false, visible_when = retired, order_index = order_index + 90
  WHERE task_template_id = tpl AND label IN (
    'Is the hot water tank rented or owned?',
    'If rented, who is the hot water tank provider?',
    'Is there any other rental equipment at the property?',
    'If yes, list the other rental equipment and its provider')
    AND visible_when IS DISTINCT FROM retired;

  IF NOT EXISTS (SELECT 1 FROM task_form_fields WHERE task_template_id = tpl AND label = q) THEN
    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options, visible_when)
    VALUES
      (tpl, 'radio', q, NULL, true, 1,
       '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Not sure","value":"not_sure"}]'::jsonb, NULL),
      (tpl, 'textarea', 'Rental equipment', NULL, false, 2,
       '{"repeater":{"hint":"One line per item.","columns":["Item e.g. Hot water tank","Company e.g. Enercare","Account number"]}}'::jsonb,
       jsonb_build_object('field_label', q, 'equals', 'yes'));
  END IF;
END $$;
