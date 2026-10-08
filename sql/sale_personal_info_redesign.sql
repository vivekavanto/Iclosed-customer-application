-- Sale personal info: sections, side-by-side fields, employment and closing-day questions. Idempotent.

DO $$
DECLARE
  tpl uuid;
  travel constant text := 'Will you be travelling on or near closing day?';
BEGIN
  SELECT id INTO tpl FROM task_templates
  WHERE name ILIKE '%personal info%' AND lead_type = 'Sale' AND is_deleted = false
  LIMIT 1;
  IF tpl IS NULL THEN
    RAISE EXCEPTION 'Sale personal information template not found.';
  END IF;

  -- Existing fields: order, layout and wording.
  UPDATE task_form_fields SET order_index = 1, options = '{"half":true}'::jsonb
  WHERE task_template_id = tpl AND label = 'Phone Number';

  UPDATE task_form_fields SET order_index = 3, placeholder = 'Start typing your address'
  WHERE task_template_id = tpl AND label = 'Street Address';

  UPDATE task_form_fields
  SET order_index = 4, label = 'Apartment/Unit Number (Optional)', placeholder = 'e.g. 4B',
      options = '{"half":true}'::jsonb
  WHERE task_template_id = tpl AND label IN ('Unit / Apartment', 'Apartment/Unit Number (Optional)');

  UPDATE task_form_fields SET order_index = 5, placeholder = 'Toronto', options = '{"half":true}'::jsonb
  WHERE task_template_id = tpl AND label = 'City';

  UPDATE task_form_fields SET order_index = 6, placeholder = 'M1C 3A7', options = '{"half":true}'::jsonb
  WHERE task_template_id = tpl AND label = 'Postal Code';

  UPDATE task_form_fields
  SET order_index = 8,
      options = '[{"label":"Primary residence","value":"primary"},{"label":"Investment property","value":"investment"}]'::jsonb
  WHERE task_template_id = tpl AND label ILIKE 'Is the property being sold your primary residence%';

  UPDATE task_form_fields
  SET order_index = 9,
      options = '[{"label":"Single","value":"single"},{"label":"Married","value":"married"},
                  {"label":"Common-law","value":"common_law"},
                  {"label":"Separated with formal separation agreement","value":"separated_formal"},
                  {"label":"Separated with no formal separation agreement","value":"separated_no_formal"},
                  {"label":"Divorced","value":"divorced"},{"label":"Widowed","value":"widowed"}]'::jsonb
  WHERE task_template_id = tpl AND label = 'Marital Status';

  UPDATE task_form_fields SET order_index = 10, label = 'Who is your spouse?'
  WHERE task_template_id = tpl AND field_type = 'spouse';

  UPDATE task_form_fields
  SET order_index = 11,
      options = options || jsonb_build_object(
        'attach_to', 'Who is your spouse?',
        'text', 'Because this is your matrimonial home, your spouse must sign as a consenting spouse even if they are not on title.')
  WHERE task_template_id = tpl AND label = 'Spousal consent notice';

  UPDATE task_form_fields SET order_index = 12
  WHERE task_template_id = tpl AND field_type = 'file' AND label ILIKE 'Separation Agreement%';

  UPDATE task_form_fields SET order_index = 13
  WHERE task_template_id = tpl AND label = 'What is your citizenship status?';

  UPDATE task_form_fields
  SET order_index = 22,
      options = '[{"label":"In person","value":"in_person"},{"label":"Virtually","value":"virtually"}]'::jsonb
  WHERE task_template_id = tpl AND label = 'Would you like to sign the documents in person or virtually?';

  UPDATE task_form_fields SET order_index = 23
  WHERE task_template_id = tpl AND label = 'Virtual signing fee notice';

  -- New rows.
  IF NOT EXISTS (SELECT 1 FROM task_form_fields WHERE task_template_id = tpl AND label = 'About you') THEN
    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options)
    VALUES
      (tpl, 'note', 'About you', NULL, false, 7, '{"variant":"section"}'::jsonb),
      (tpl, 'note', 'Employment', NULL, false, 14, '{"variant":"section"}'::jsonb),
      (tpl, 'text', 'Occupation', 'e.g. Engineer', true, 15, '{"half":true}'::jsonb),
      (tpl, 'text', 'Employer Name', 'e.g. Acme Inc.', true, 16,
       '{"half":true,"hint":"If unemployed or self employed, please indicate."}'::jsonb),
      (tpl, 'text', 'Employer Phone Number', '(416) 555-1234', true, 17,
       '{"half":true,"hint":"If unemployed, enter NA"}'::jsonb),
      (tpl, 'text', 'Employer Business Address', 'Start typing the address', true, 18,
       '{"hint":"If unemployed, enter NA"}'::jsonb),
      (tpl, 'note', 'Closing day', NULL, false, 19, '{"variant":"section"}'::jsonb),
      (tpl, 'select', travel, NULL, true, 20,
       '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb),
      (tpl, 'text', 'When will you be away?', 'e.g. Nov 15 – Nov 30', false, 21, '{"optional":true}'::jsonb);

    UPDATE task_form_fields
    SET visible_when = jsonb_build_object('field_label', travel, 'equals', 'yes')
    WHERE task_template_id = tpl AND label = 'When will you be away?';
  END IF;
END $$;
