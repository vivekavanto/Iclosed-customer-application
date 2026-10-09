-- Purchase APS, home insurance and void cheque per portal redesign. Idempotent.

DO $$
DECLARE
  aps uuid;
  ins uuid;
  vc  uuid;
  q   constant text := 'What type of property is this?';
BEGIN
  SELECT id INTO aps FROM task_templates
  WHERE name ILIKE '%agreement of purchase%' AND lead_type = 'Purchase' AND is_deleted = false LIMIT 1;
  SELECT id INTO ins FROM task_templates
  WHERE name ILIKE '%home insurance%' AND lead_type = 'Purchase' AND is_deleted = false LIMIT 1;
  SELECT id INTO vc FROM task_templates
  WHERE name ILIKE '%void cheque%' AND lead_type = 'Purchase' AND is_deleted = false LIMIT 1;

  -- APS: slot label, then property type with a condo note.
  UPDATE task_form_fields
  SET options = COALESCE(options, '{}'::jsonb) || '{"slot_label":"Agreement of Purchase and Sale"}'::jsonb
  WHERE task_template_id = aps AND field_type = 'file';
  IF aps IS NOT NULL AND NOT EXISTS (SELECT 1 FROM task_form_fields WHERE task_template_id = aps AND label = q) THEN
    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options)
    VALUES
      (aps, 'radio', q, NULL, true, 2,
       '[{"label":"House (freehold)","value":"House (freehold)"},{"label":"Freehold townhouse","value":"Freehold townhouse"},{"label":"Condo","value":"Condo"},{"label":"Condo townhouse","value":"Condo townhouse"}]'::jsonb),
      (aps, 'note', 'Condos need a status certificate. It is usually provided at intake — you will find it under Your Documents.',
       NULL, false, 3, NULL);
    UPDATE task_form_fields
    SET visible_when = jsonb_build_object('field_label', q, 'equals_any', jsonb_build_array('Condo', 'Condo townhouse'))
    WHERE task_template_id = aps AND field_type = 'note';
  END IF;

  -- Home insurance upload.
  UPDATE task_form_fields
  SET label = 'Insurance binder or policy',
      options = COALESCE(options, '{}'::jsonb) || '{"slot_label":"Home insurance binder"}'::jsonb
  WHERE task_template_id = ins AND field_type = 'file';

  -- Void cheques side by side.
  UPDATE task_form_fields
  SET options = COALESCE(options, '{}'::jsonb) || '{"half":true,"slot_label":"Void cheque or direct deposit form"}'::jsonb
  WHERE task_template_id = vc AND field_type = 'file';
END $$;
