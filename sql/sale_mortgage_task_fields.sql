-- Sale mortgage task: mortgage question, lender, balance, statement upload. Idempotent.

DO $$
DECLARE
  tpl  uuid;
  q    constant text := 'Is there a mortgage or line of credit on this property?';
  yes  constant jsonb := jsonb_build_object('field_label', q, 'equals', 'Yes');
BEGIN
  SELECT id INTO tpl FROM task_templates
  WHERE name ILIKE '%mortgage statement%' AND lead_type = 'Sale' AND is_deleted = false
  LIMIT 1;
  IF tpl IS NULL THEN
    RAISE EXCEPTION 'Sale mortgage statement template not found.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM task_form_fields WHERE task_template_id = tpl AND label = q) THEN
    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options)
    VALUES
      (tpl, 'radio', q, NULL, true, 1,
       '[{"label":"Yes","value":"Yes"},{"label":"No","value":"No"}]'::jsonb),
      (tpl, 'text', 'Lender name', 'e.g. TD', true, 2, '{"half":true}'::jsonb),
      (tpl, 'text', 'Approximate balance owing', '540,000', false, 3,
       '{"half":true,"prefix":"$","optional":true}'::jsonb);

    UPDATE task_form_fields SET visible_when = yes
    WHERE task_template_id = tpl AND label IN ('Lender name', 'Approximate balance owing');
  END IF;

  -- Existing upload becomes the last field, shown only on Yes.
  UPDATE task_form_fields
  SET label = 'Latest mortgage statement',
      order_index = 4,
      visible_when = yes,
      options = COALESCE(options, '{}'::jsonb)
                || '{"accept":".pdf,.jpg,.jpeg,.png","max_mb":10,"slot_label":"Mortgage statement"}'::jsonb
  WHERE task_template_id = tpl AND field_type = 'file';
END $$;
