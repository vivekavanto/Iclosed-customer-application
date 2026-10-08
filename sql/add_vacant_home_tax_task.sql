-- Sale vacant home tax task, added by code. Idempotent.
DO $$
DECLARE
  tax task_templates%ROWTYPE;
  tpl uuid;
  q constant text := 'Is the property vacant?';
BEGIN
  SELECT * INTO tax FROM task_templates
  WHERE name ILIKE '%property tax%' AND lead_type = 'Sale' AND is_deleted = false LIMIT 1;
  IF tax.id IS NULL THEN
    RAISE EXCEPTION 'Sale property tax template not found.';
  END IF;

  UPDATE task_form_fields
  SET visible_when = '{"field_label":"Vacant home tax declaration","equals":"__retired__"}'::jsonb
  WHERE task_template_id = tax.id
    AND (label = 'Vacant home tax declaration' OR label ILIKE '%vacant%' OR label ILIKE 'Our team will confirm any vacant home tax%');

  UPDATE task_templates SET order_index = 8 WHERE lead_type = 'Sale' AND is_deleted = false AND name ILIKE '%rental equipment%';
  UPDATE task_templates SET order_index = 9 WHERE lead_type = 'Sale' AND is_deleted = false AND name ILIKE '%void cheque%';

  SELECT id INTO tpl FROM task_templates
  WHERE name = 'Vacant home tax declaration' AND lead_type = 'Sale' AND is_deleted = false LIMIT 1;
  IF tpl IS NOT NULL THEN
    RETURN;
  END IF;

  INSERT INTO task_templates
    (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
     is_deleted, is_default, stage_template_id, is_shared, activation_required)
  VALUES
    ('Sale', tax.role_type, 'Vacant home tax declaration', 7, tax.deadline_rule, false,
     false, false, tax.stage_template_id, true, false)
  RETURNING id INTO tpl;

  INSERT INTO task_form_fields (task_template_id, field_type, label, placeholder, required, order_index, options, visible_when)
  VALUES
    (tpl, 'note', 'Vacant home tax (Toronto)', NULL, false, 1, jsonb_build_object('variant', 'paragraph', 'only_cities', jsonb_build_array('toronto'),
      'text', 'Toronto charges a vacant home tax on homes left empty for six months or more during the year. Please declare whether the property is vacant.'), NULL),
    (tpl, 'note', 'Vacant home tax (Hamilton)', NULL, false, 2, jsonb_build_object('variant', 'paragraph', 'only_cities', jsonb_build_array('hamilton'),
      'text', 'Hamilton charges a vacant home tax on homes left empty for more than 183 days in the previous calendar year. Please declare whether the property is vacant.'), NULL),
    (tpl, 'note', 'Vacant home tax (Ottawa)', NULL, false, 3, jsonb_build_object('variant', 'paragraph', 'only_cities', jsonb_build_array('ottawa'),
      'text', 'Ottawa charges a vacant home tax on homes left empty for more than 184 days in the previous calendar year. Please declare whether the property is vacant.'), NULL),
    (tpl, 'radio', q, NULL, true, 4, jsonb_build_array(
      jsonb_build_object('label', 'No, it is occupied (I live there or it is rented)', 'value', 'occupied'),
      jsonb_build_object('label', 'Yes, it is vacant', 'value', 'vacant')), NULL),
    (tpl, 'note', 'Occupied homes are not charged the vacant home tax. Please make sure your declaration is filed with the city.', NULL, false, 5, NULL,
      jsonb_build_object('field_label', q, 'equals', 'occupied')),
    (tpl, 'note', 'The vacant home tax may apply. We will confirm whether it needs to be adjusted on closing.', NULL, false, 6, NULL,
      jsonb_build_object('field_label', q, 'equals', 'vacant'));
END $$;
