-- Sale keys, lockbox and garage task per redesign. Idempotent.
DO $$
DECLARE
  tpl uuid;
  g constant text := 'Is there a garage?';
BEGIN
  SELECT id INTO tpl FROM task_templates
  WHERE name ILIKE '%lockbox%' AND lead_type = 'Sale' AND is_deleted = false LIMIT 1;
  IF tpl IS NULL THEN
    RAISE EXCEPTION 'Sale lockbox template not found.';
  END IF;

  UPDATE task_form_fields
  SET label = 'Lockbox code', placeholder = '4821', order_index = 2,
      options = COALESCE(options, '{}'::jsonb) || '{"half":true}'::jsonb
  WHERE task_template_id = tpl AND field_type = 'text' AND label ILIKE 'lockbox code';

  UPDATE task_form_fields
  SET options = COALESCE(options, '{}'::jsonb) || '{"optional":true}'::jsonb
  WHERE task_template_id = tpl AND label IN ('Garage remotes you will leave', 'Garage keypad code (if any)');

  IF EXISTS (SELECT 1 FROM task_form_fields WHERE task_template_id = tpl AND label = g) THEN
    RETURN;
  END IF;

  INSERT INTO task_form_fields (task_template_id, field_type, label, placeholder, required, order_index, options, visible_when)
  VALUES
    (tpl, 'note', 'Lockbox intro', NULL, false, 1,
      '{"variant":"paragraph","text":"On closing day we release the keys to the buyer''s lawyer. Tell us how they''ll get in."}'::jsonb, NULL),
    (tpl, 'text', 'Where is the lockbox?', 'e.g. Side gate', false, 3, '{"half":true}'::jsonb, NULL),
    (tpl, 'text', 'Keys you will leave', 'e.g. 3 house keys, 1 mailbox key', false, 4, '{"half":true}'::jsonb, NULL),
    (tpl, 'radio', g, NULL, true, 5, '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb, NULL),
    (tpl, 'text', 'Garage remotes you will leave', '2', false, 6, '{"half":true,"optional":true}'::jsonb,
      jsonb_build_object('field_label', g, 'equals', 'yes')),
    (tpl, 'text', 'Garage keypad code (if any)', '1947', false, 7, '{"half":true,"optional":true}'::jsonb,
      jsonb_build_object('field_label', g, 'equals', 'yes'));
END $$;
