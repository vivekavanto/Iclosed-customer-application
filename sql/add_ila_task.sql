-- Purchase and sale ILA task templates, added by code. Idempotent.
DO $$
DECLARE
  anchor task_templates%ROWTYPE;
  tpl uuid;
BEGIN
  SELECT * INTO anchor FROM task_templates
  WHERE name = 'Ownership shares' AND lead_type = 'Purchase' AND is_deleted = false LIMIT 1;
  IF anchor.id IS NULL THEN
    RAISE EXCEPTION 'Purchase Ownership shares template not found.';
  END IF;

  SELECT id INTO tpl FROM task_templates
  WHERE name = 'Independent legal advice' AND lead_type = 'Purchase' AND is_deleted = false LIMIT 1;
  IF tpl IS NOT NULL THEN
    RETURN;
  END IF;

  INSERT INTO task_templates
    (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
     is_deleted, is_default, stage_template_id, is_shared, activation_required)
  VALUES
    ('Purchase', anchor.role_type, 'Independent legal advice', anchor.order_index + 1,
     anchor.deadline_rule, false, false, false, anchor.stage_template_id, true, false)
  RETURNING id INTO tpl;

  INSERT INTO task_form_fields (task_template_id, field_type, label, placeholder, required, order_index, options)
  VALUES
    (tpl, 'note', 'ILA intro', NULL, false, 1, jsonb_build_object('variant', 'paragraph', 'text',
      '{name} is taking a minority share of the home but is fully responsible for the mortgage. {name} needs Independent Legal Advice (ILA) from a lawyer outside our firm. The ILA meeting is with {name} alone, not together with the other purchaser.')),
    (tpl, 'note', 'ILA is given by a lawyer outside our firm, who charges their own fee (usually $250 to $450, plus HST).', NULL, false, 2, NULL),
    (tpl, 'note', 'How it works', NULL, false, 3, jsonb_build_object('variant', 'section', 'boxed', true, 'text',
      E'1. Choose any Ontario lawyer outside our firm.\n2. Tell us who you chose below.\n3. We send the ILA package directly to that lawyer.')),
    (tpl, 'text', 'ILA lawyer name', 'Full name', true, 4, '{"half":true}'::jsonb),
    (tpl, 'text', 'ILA lawyer email or phone', 'name@lawfirm.ca', true, 5, '{"half":true}'::jsonb),
    (tpl, 'checkbox', 'I have completed the ILA', NULL, false, 6, NULL);
END $$;

-- Sale ILA template, after the sale proceeds (void cheque) task.
DO $$
DECLARE
  anchor task_templates%ROWTYPE;
  tpl uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM task_templates
             WHERE name = 'Independent legal advice' AND lead_type = 'Sale' AND is_deleted = false) THEN
    RETURN;
  END IF;

  SELECT * INTO anchor FROM task_templates
  WHERE name ILIKE '%void cheque%' AND lead_type = 'Sale' AND is_deleted = false LIMIT 1;
  IF anchor.id IS NULL THEN
    RAISE EXCEPTION 'Sale void cheque template not found.';
  END IF;

  UPDATE task_templates SET order_index = order_index + 1
  WHERE lead_type = 'Sale' AND is_deleted = false AND order_index > anchor.order_index;

  INSERT INTO task_templates
    (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
     is_deleted, is_default, stage_template_id, is_shared, activation_required)
  VALUES
    ('Sale', anchor.role_type, 'Independent legal advice', anchor.order_index + 1,
     anchor.deadline_rule, false, false, false, anchor.stage_template_id, true, false)
  RETURNING id INTO tpl;

  INSERT INTO task_form_fields (task_template_id, field_type, label, placeholder, required, order_index, options)
  VALUES
    (tpl, 'note', 'ILA intro', NULL, false, 1, jsonb_build_object('variant', 'paragraph', 'text',
      '{name} is receiving a minority share of the sale proceeds. {name} needs Independent Legal Advice (ILA) from a lawyer outside our firm. The ILA meeting is with {name} alone, not together with the other seller.')),
    (tpl, 'note', 'ILA is given by a lawyer outside our firm, who charges their own fee (usually $250 to $450, plus HST).', NULL, false, 2, NULL),
    (tpl, 'note', 'How it works', NULL, false, 3, jsonb_build_object('variant', 'section', 'boxed', true, 'text',
      E'1. Choose any Ontario lawyer outside our firm.\n2. Tell us who you chose below.\n3. We send the ILA package directly to that lawyer.')),
    (tpl, 'text', 'ILA lawyer name', 'Full name', true, 4, '{"half":true}'::jsonb),
    (tpl, 'text', 'ILA lawyer email or phone', 'name@lawfirm.ca', true, 5, '{"half":true}'::jsonb),
    (tpl, 'checkbox', 'I have completed the ILA', NULL, false, 6, NULL);
END $$;
