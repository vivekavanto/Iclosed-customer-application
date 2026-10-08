-- Purchase personal info per portal redesign. Idempotent.

DO $$
DECLARE
  tpl     uuid;
  res     constant text := 'Is this purchase property your primary residence or an investment property?';
  q_self  constant text := 'Have you ever owned a property anywhere in the world?';
  q_sp    constant text := 'Did your spouse own a home anywhere in the world while you were spouses?';
  q_cit   constant text := 'What is your citizenship status?';
  travel  constant text := 'Will you be travelling on or near closing day?';
  retired constant jsonb := '{"field_label":"Marital Status","equals":"__retired__"}';
BEGIN
  SELECT id INTO tpl FROM task_templates
  WHERE name ILIKE '%personal info%' AND lead_type = 'Purchase' AND is_deleted = false
  LIMIT 1;
  IF tpl IS NULL THEN
    RAISE EXCEPTION 'Purchase personal information template not found.';
  END IF;

  -- Contact and mail forwarding.
  UPDATE task_form_fields SET order_index = 1, options = '{"half":true}'::jsonb
  WHERE task_template_id = tpl AND label = 'Phone Number';
  UPDATE task_form_fields SET order_index = 4, placeholder = 'Start typing your address'
  WHERE task_template_id = tpl AND label = 'Street Address';
  UPDATE task_form_fields
  SET order_index = 5, label = 'Apartment/Unit Number (Optional)', placeholder = 'e.g. 4B', options = '{"half":true}'::jsonb
  WHERE task_template_id = tpl AND label IN ('Unit / Apartment', 'Apartment/Unit Number (Optional)');
  UPDATE task_form_fields SET order_index = 6, placeholder = 'Toronto', options = '{"half":true}'::jsonb
  WHERE task_template_id = tpl AND label = 'City';
  UPDATE task_form_fields SET order_index = 7, placeholder = 'M1C 3A7', options = '{"half":true}'::jsonb
  WHERE task_template_id = tpl AND label = 'Postal Code';

  -- About you.
  UPDATE task_form_fields
  SET order_index = 9,
      options = '[{"label":"Primary residence","value":"primary"},{"label":"Investment property","value":"investment"}]'::jsonb
  WHERE task_template_id = tpl AND label = res;
  UPDATE task_form_fields
  SET order_index = 10,
      options = '[{"label":"Single","value":"single"},{"label":"Married","value":"married"},
                  {"label":"Common-law","value":"common_law"},{"label":"Separated","value":"separated"},
                  {"label":"Divorced","value":"divorced"},{"label":"Widowed","value":"widowed"}]'::jsonb
  WHERE task_template_id = tpl AND label = 'Marital Status';
  UPDATE task_form_fields
  SET order_index = 11, label = 'Who is your spouse?',
      options = '{"visible_when":{"field_label":"Marital Status","equals":"married"}}'::jsonb
  WHERE task_template_id = tpl AND field_type = 'spouse';
  UPDATE task_form_fields
  SET order_index = 12,
      options = options || jsonb_build_object(
        'attach_to', 'Who is your spouse?',
        'text', 'Because this will be your matrimonial home, your spouse must sign as a consenting spouse even if they are not going on title.')
  WHERE task_template_id = tpl AND label = 'Spousal consent notice';
  UPDATE task_form_fields SET order_index = 13
  WHERE task_template_id = tpl AND field_type = 'file' AND label ILIKE 'Separation Agreement%';

  -- Old rebate questions: hidden, kept for their saved answers.
  UPDATE task_form_fields SET required = false, visible_when = retired
  WHERE task_template_id = tpl AND label IN (
    'Have you or your spouse ever owned a property?', 'Have you ever owned a property?',
    'Has your spouse ever owned a property?', 'Was the property sold before the date of marriage?',
    'First-time buyer rebate notice (you)', 'First-time buyer rebate notice (spouse)');

  UPDATE task_form_fields SET order_index = 25 WHERE task_template_id = tpl AND label = q_cit;
  UPDATE task_form_fields SET order_index = 27
  WHERE task_template_id = tpl AND label ILIKE 'In the past 365 days%';
  UPDATE task_form_fields SET order_index = 28, placeholder = 'e.g. Employment income, savings, gift from family'
  WHERE task_template_id = tpl AND label ILIKE 'What are your source of funds%';

  -- Employment.
  UPDATE task_form_fields SET order_index = 30, options = '{"half":true}'::jsonb
  WHERE task_template_id = tpl AND label = 'Occupation';
  UPDATE task_form_fields
  SET order_index = 31, label = 'Employer Name', placeholder = 'e.g. Acme Inc.', required = true,
      options = '{"half":true,"hint":"If unemployed or self employed, please indicate."}'::jsonb
  WHERE task_template_id = tpl AND label IN ('Employer or business name', 'Employer Name');
  UPDATE task_form_fields
  SET order_index = 32, label = 'Employer Phone Number', field_type = 'text', placeholder = '(416) 555-1234',
      required = true, options = '{"half":true,"hint":"If unemployed, enter NA"}'::jsonb
  WHERE task_template_id = tpl AND label IN ('Business phone number', 'Employer Phone Number');
  UPDATE task_form_fields
  SET order_index = 33, label = 'Employer Business Address', placeholder = 'Start typing the address',
      required = true, options = '{"hint":"If unemployed, enter NA"}'::jsonb
  WHERE task_template_id = tpl AND label IN ('Business address', 'Employer Business Address');

  -- Signing.
  UPDATE task_form_fields
  SET order_index = 38,
      options = '[{"label":"In person","value":"in_person"},{"label":"Virtually","value":"virtually"}]'::jsonb
  WHERE task_template_id = tpl AND label = 'Would you like to sign the documents in person or virtually?';
  UPDATE task_form_fields SET order_index = 39
  WHERE task_template_id = tpl AND label = 'Virtual signing fee notice';

  IF NOT EXISTS (SELECT 1 FROM task_form_fields WHERE task_template_id = tpl AND label = q_self) THEN
    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options)
    VALUES
      (tpl, 'note', 'About you', NULL, false, 8, '{"variant":"section"}'::jsonb),
      (tpl, 'note', 'First-time buyer rebate', NULL, false, 14, '{"variant":"section"}'::jsonb),
      (tpl, 'select', q_self, NULL, true, 15,
       '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"I need more clarification","value":"unsure"}]'::jsonb),
      (tpl, 'note', 'Rebate hint (you)', NULL, false, 16, jsonb_build_object('variant', 'hint', 'attach_to', q_self,
       'text', 'First-time buyers can get a refund of up to $4,000 on Ontario and up to $4,475 on Toronto land transfer tax. You do not qualify if you have owned a home anywhere in the world.')),
      (tpl, 'note', 'Rebate notice (you owned)', NULL, false, 17, jsonb_build_object('variant', 'warning', 'collapsible', false,
       'text', 'Please note the first time buyer rebate is not applicable as you have owned a property in the past.')),
      (tpl, 'note', 'Rebate clarification (you)', NULL, false, 18, jsonb_build_object('variant', 'warning', 'collapsible', false,
       'text', 'No problem — our team will reach out to go over your eligibility before closing.')),
      (tpl, 'select', q_sp, NULL, false, 19,
       '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"I need more clarification","value":"unsure"}]'::jsonb),
      (tpl, 'note', 'Rebate hint (spouse)', NULL, false, 20, jsonb_build_object('variant', 'hint', 'attach_to', q_sp,
       'text', 'If your spouse owned a home while you were spouses, neither of you qualifies for the first-time homebuyer rebate. If their ownership ended before you became spouses, you may qualify for a rebate covering both your share and your spouse’s share, provided you are both Canadian citizens or permanent residents of Canada.')),
      (tpl, 'note', 'Rebate notice (spouse owned)', NULL, false, 21, jsonb_build_object('variant', 'warning', 'collapsible', false,
       'text', 'You are not entitled to the first time buyer rebate as your spouse owned a property while you were spouses.')),
      (tpl, 'note', 'Rebate clarification (spouse)', NULL, false, 22, jsonb_build_object('variant', 'warning', 'collapsible', false,
       'text', 'No problem — our team will reach out to go over your eligibility before closing.')),
      (tpl, 'note', 'Citizenship notice', NULL, false, 26, jsonb_build_object('variant', 'warning', 'collapsible', false,
       'text', 'A law clerk will contact you about your status before closing, as additional taxes or restrictions may apply.')),
      (tpl, 'note', 'Employment', NULL, false, 29, '{"variant":"section"}'::jsonb),
      (tpl, 'note', 'Closing day', NULL, false, 34, '{"variant":"section"}'::jsonb),
      (tpl, 'select', travel, NULL, true, 35,
       '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb),
      (tpl, 'text', 'When will you be away?', 'e.g. Nov 15 – Nov 30', false, 36, '{"optional":true}'::jsonb);

    UPDATE task_form_fields SET visible_when = jsonb_build_object('field_label', q_self, 'equals', 'yes')
    WHERE task_template_id = tpl AND label = 'Rebate notice (you owned)';
    UPDATE task_form_fields SET visible_when = jsonb_build_object('field_label', q_self, 'equals', 'unsure')
    WHERE task_template_id = tpl AND label = 'Rebate clarification (you)';
    -- Spouse question is required whenever shown (married or common-law).
    UPDATE task_form_fields
    SET visible_when = jsonb_build_object('field_label', 'Marital Status', 'equals_any', jsonb_build_array('married', 'common_law'))
    WHERE task_template_id = tpl AND label IN (q_sp, 'Rebate hint (spouse)');
    UPDATE task_form_fields SET visible_when = jsonb_build_object('field_label', q_sp, 'equals', 'yes')
    WHERE task_template_id = tpl AND label = 'Rebate notice (spouse owned)';
    UPDATE task_form_fields SET visible_when = jsonb_build_object('field_label', q_sp, 'equals', 'unsure')
    WHERE task_template_id = tpl AND label = 'Rebate clarification (spouse)';
    UPDATE task_form_fields
    SET visible_when = jsonb_build_object('field_label', q_cit, 'equals_any', jsonb_build_array('visa', 'refugee_status', 'non_citizen_unsure'))
    WHERE task_template_id = tpl AND label = 'Citizenship notice';
    UPDATE task_form_fields SET visible_when = jsonb_build_object('field_label', travel, 'equals', 'yes')
    WHERE task_template_id = tpl AND label = 'When will you be away?';
  END IF;
END $$;
