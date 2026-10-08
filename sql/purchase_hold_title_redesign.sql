-- Purchase hold-title task per portal redesign. Idempotent.

DO $$
DECLARE
  tpl uuid;
  q   constant text := 'How would you like to hold title?';
BEGIN
  SELECT id INTO tpl FROM task_templates
  WHERE name = 'Ownership shares' AND lead_type = 'Purchase' AND is_deleted = false
  LIMIT 1;
  IF tpl IS NULL THEN
    RAISE EXCEPTION 'Purchase ownership shares template not found.';
  END IF;

  UPDATE task_form_fields
  SET label = q,
      options = '[{"label":"Joint tenants","value":"Joint Tenants"},{"label":"Tenants in common","value":"Tenants in Common"}]'::jsonb
  WHERE task_template_id = tpl AND field_type = 'select' AND label ILIKE 'How would you like to hold title%';

  UPDATE task_form_fields
  SET order_index = 3, options = jsonb_build_object('visible_when', jsonb_build_object('field_label', q, 'equals', 'Tenants in Common'))
  WHERE task_template_id = tpl AND field_type = 'shares';

  UPDATE task_form_fields
  SET order_index = 5,
      options = jsonb_build_object('variant', 'warning', 'collapsible', false,
        'text', 'If the shares are unequal, the person with the minority share needs Independent Legal Advice (ILA), on their own. ILA is given by a lawyer outside our firm, who charges their own fee (usually $250 to $450, plus HST).',
        'visible_when', jsonb_build_object('field_label', q, 'equals', 'Tenants in Common'))
  WHERE task_template_id = tpl AND label = 'Independent Legal Advice (ILA) notice';

  IF NOT EXISTS (SELECT 1 FROM task_form_fields WHERE task_template_id = tpl AND label = 'Shares hint') THEN
    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options)
    VALUES (tpl, 'note', 'Shares hint', NULL, false, 4,
            '{"variant":"hint","attach_to":"Ownership shares","text":"Must add up to 100%."}'::jsonb);
  END IF;
END $$;
