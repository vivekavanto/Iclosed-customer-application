-- Sale void cheque ("Your sale proceeds") per portal redesign. Idempotent.
DO $$
DECLARE
  tpl uuid;
  q constant text := 'How should we split the proceeds?';
  cheque constant jsonb := '{"half":true,"accept":".pdf,.jpg,.jpeg,.png","max_mb":10,"doc_type":"void_cheque","slot_label":"Void cheque or direct deposit form"}';
BEGIN
  SELECT id INTO tpl FROM task_templates
  WHERE name ILIKE '%void cheque%' AND lead_type = 'Sale' AND is_deleted = false LIMIT 1;
  IF tpl IS NULL THEN
    RAISE EXCEPTION 'Sale void cheque template not found.';
  END IF;

  -- Old single upload kept for saved files.
  UPDATE task_form_fields
  SET required = false, visible_when = jsonb_build_object('field_label', q, 'equals', '__retired__')
  WHERE task_template_id = tpl AND label = 'Provide Void Cheque';

  IF NOT EXISTS (SELECT 1 FROM task_form_fields WHERE task_template_id = tpl AND label = q) THEN
    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options, visible_when)
    VALUES
      (tpl, 'note', 'If this is a sale of a matrimonial home, please note you''ll need the consent of your spouse for the sale.',
       NULL, false, 1, NULL, NULL),
      (tpl, 'radio', q, NULL, true, 2,
       '[{"label":"In accordance with your ownership","value":"ownership"},{"label":"A different split","value":"different"}]'::jsonb, NULL),
      (tpl, 'shares', 'Each seller''s share of the proceeds', NULL, false, 3,
       '{"hint":"Must add up to 100%."}'::jsonb, jsonb_build_object('field_label', q, 'equals', 'different')),
      -- Flag drops the split question on single-seller files.
      (tpl, 'note', 'If you have a joint account, you can upload one void cheque for that account instead.',
       NULL, false, 4, jsonb_build_object('multi_party_only', true, 'attach_to', q), NULL),
      (tpl, 'file', 'Seller 1', NULL, true, 5, cheque, NULL),
      (tpl, 'file', 'Seller 2', NULL, true, 6, cheque || '{"multi_party_only":true}'::jsonb, NULL);
  END IF;
END $$;
