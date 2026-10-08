-- Sale proceeds joint account checkbox. Idempotent.
DO $$
DECLARE
  tpl uuid;
  cb constant text := 'I have a joint account';
  split constant text := 'How should we split the proceeds?';
  file_opts constant jsonb := '{"accept":".pdf,.jpg,.jpeg,.png","max_mb":10,"doc_type":"void_cheque","slot_label":"Void cheque or direct deposit form for the joint account","multi_party_only":true}';
BEGIN
  SELECT id INTO tpl FROM task_templates
  WHERE name ILIKE '%void cheque%' AND lead_type = 'Sale' AND is_deleted = false LIMIT 1;
  IF tpl IS NULL THEN
    RAISE EXCEPTION 'Sale Void Cheque template not found.';
  END IF;

  UPDATE task_form_fields
  SET visible_when = jsonb_build_object('field_label', 'How should we split the proceeds?', 'equals', '__retired__')
  WHERE task_template_id = tpl AND label ILIKE 'If you have a joint account%';

  IF NOT EXISTS (SELECT 1 FROM task_form_fields WHERE task_template_id = tpl AND label = cb) THEN
    INSERT INTO task_form_fields (task_template_id, field_type, label, placeholder, required, order_index, options, visible_when)
    VALUES
      (tpl, 'checkbox', cb, NULL, false, 4, '{"multi_party_only":true}'::jsonb, NULL),
      (tpl, 'file', 'Joint account', NULL, true, 7, file_opts, jsonb_build_object('field_label', cb, 'equals', 'true'));
  END IF;

  -- No joint account option with a different split.
  UPDATE task_form_fields
  SET visible_when = jsonb_build_object('field_label', split, 'not_equals', 'different')
  WHERE task_template_id = tpl AND label = cb;

  UPDATE task_form_fields
  SET visible_when = jsonb_build_object('all', jsonb_build_array(
        jsonb_build_object('field_label', cb, 'equals', 'true'),
        jsonb_build_object('field_label', split, 'not_equals', 'different')))
  WHERE task_template_id = tpl AND label = 'Joint account';

  UPDATE task_form_fields
  SET visible_when = jsonb_build_object('any', jsonb_build_array(
        jsonb_build_object('field_label', cb, 'not_equals', 'true'),
        jsonb_build_object('field_label', split, 'equals', 'different')))
  WHERE task_template_id = tpl AND field_type = 'file' AND label IN ('Seller 1', 'Seller 2');
END $$;
