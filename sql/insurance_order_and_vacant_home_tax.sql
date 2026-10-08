-- Insurance after Void Cheque; sale vacant home tax. Idempotent.
DO $$
DECLARE
  ins task_templates%ROWTYPE;
  vc  task_templates%ROWTYPE;
  tax uuid;
  q constant text := 'Vacant home tax declaration';
  cities constant jsonb := '["toronto","hamilton","ottawa"]';
BEGIN
  SELECT * INTO ins FROM task_templates
  WHERE name ILIKE '%home insurance%' AND lead_type = 'Purchase' AND is_deleted = false LIMIT 1;
  SELECT * INTO vc FROM task_templates
  WHERE name ILIKE '%void cheque%' AND lead_type = 'Purchase' AND is_deleted = false LIMIT 1;
  IF ins.id IS NOT NULL AND vc.id IS NOT NULL AND ins.order_index < vc.order_index THEN
    UPDATE task_templates SET order_index = vc.order_index WHERE id = ins.id;
    UPDATE task_templates SET order_index = ins.order_index WHERE id = vc.id;
  END IF;

  SELECT id INTO tax FROM task_templates
  WHERE name ILIKE '%property tax%' AND lead_type = 'Sale' AND is_deleted = false LIMIT 1;
  IF tax IS NULL OR EXISTS (SELECT 1 FROM task_form_fields WHERE task_template_id = tax AND label = q) THEN
    RETURN;
  END IF;

  -- Shown only in these cities; see /api/task-form-fields.
  INSERT INTO task_form_fields (task_template_id, field_type, label, placeholder, required, order_index, options, visible_when)
  VALUES
    (tax, 'note', 'Toronto, Hamilton and Ottawa tax homes that are left vacant. If you live in the property, it is not taxed.',
     NULL, false, 12, jsonb_build_object('only_cities', cities, 'attach_to', q), NULL),
    (tax, 'radio', q, NULL, true, 13,
     jsonb_build_array(
       jsonb_build_object('label', 'I live there (not vacant)', 'value', 'occupied'),
       jsonb_build_object('label', 'It is vacant', 'value', 'vacant')),
     NULL),
    (tax, 'note', 'Our team will confirm any vacant home tax with you before closing.',
     NULL, false, 14, jsonb_build_object('only_cities', cities),
     jsonb_build_object('field_label', q, 'equals', 'vacant'));
END $$;
