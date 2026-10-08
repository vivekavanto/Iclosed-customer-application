-- Personal info: residence clarification and rebate gated on residence. Idempotent.
DO $$
DECLARE
  tpl record;
  q text;
  unsure_note constant text := 'Residence clarification';
  not_investment jsonb;
BEGIN
  FOR tpl IN
    SELECT id, lead_type FROM task_templates
    WHERE name ILIKE '%personal information%' AND lead_type IN ('Purchase', 'Sale') AND is_deleted = false
  LOOP
    SELECT label INTO q FROM task_form_fields
    WHERE task_template_id = tpl.id AND label ILIKE '%primary residence or an investment property%' LIMIT 1;
    CONTINUE WHEN q IS NULL;

    -- 1. Clarification option and its note.
    UPDATE task_form_fields
    SET options = options || '[{"label":"I need more clarification","value":"unsure"}]'::jsonb
    WHERE task_template_id = tpl.id AND label = q AND options::text NOT LIKE '%"unsure"%';

    IF NOT EXISTS (SELECT 1 FROM task_form_fields WHERE task_template_id = tpl.id AND label = unsure_note) THEN
      UPDATE task_form_fields SET order_index = order_index + 1
      WHERE task_template_id = tpl.id
        AND order_index > (SELECT order_index FROM task_form_fields WHERE task_template_id = tpl.id AND label = q);
      INSERT INTO task_form_fields (task_template_id, field_type, label, placeholder, required, order_index, options, visible_when)
      SELECT tpl.id, 'note', unsure_note, NULL, false, order_index + 1,
             '{"text":"No problem — our team will reach out to confirm this with you before closing.","variant":"warning","collapsible":false}'::jsonb,
             jsonb_build_object('field_label', q, 'equals', 'unsure')
      FROM task_form_fields WHERE task_template_id = tpl.id AND label = q;
    END IF;

    -- Spouse and separation questions also show while residence is unconfirmed.
    UPDATE task_form_fields
    SET options = replace(options::text,
          jsonb_build_object('equals', 'primary', 'field_label', q)::text,
          jsonb_build_object('equals_any', jsonb_build_array('primary', 'unsure'), 'field_label', q)::text)::jsonb
    WHERE task_template_id = tpl.id
      AND options::text LIKE '%' || jsonb_build_object('equals', 'primary', 'field_label', q)::text || '%';

    -- 2. No rebate questions for investment (purchase).
    IF tpl.lead_type = 'Purchase' THEN
      not_investment := jsonb_build_object('field_label', q, 'not_equals', 'investment');
      UPDATE task_form_fields
      SET visible_when = CASE
            WHEN visible_when IS NULL THEN not_investment
            WHEN visible_when ? 'all' THEN jsonb_set(visible_when, '{all}', (visible_when -> 'all') || jsonb_build_array(not_investment))
            ELSE jsonb_build_object('all', jsonb_build_array(visible_when, not_investment))
          END
      WHERE task_template_id = tpl.id
        AND label IN (
          'First-time buyer rebate',
          'Have you ever owned a property anywhere in the world?',
          'Rebate notice (you owned)',
          'Rebate clarification (you)',
          'Did your spouse own a home anywhere in the world while you were spouses?',
          'Rebate hint (spouse)',
          'Rebate notice (spouse owned)',
          'Rebate clarification (spouse)')
        AND (visible_when IS NULL OR visible_when::text NOT LIKE '%"investment"%');

      -- 3. Self-declaration under the rebate heading.
      UPDATE task_form_fields
      SET options = options || '{"text":"Please note this is a self-declaration and we are relying on the accuracy of the information provided."}'::jsonb
      WHERE task_template_id = tpl.id AND label = 'First-time buyer rebate';
    END IF;
  END LOOP;
END $$;
