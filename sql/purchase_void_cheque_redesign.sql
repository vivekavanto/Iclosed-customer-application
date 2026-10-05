-- Purchase void cheque per portal redesign. Idempotent.

DO $$
DECLARE
  tpl uuid;
  retired constant jsonb := '{"field_label":"Whose account should be used for the mortgage payments?","equals":"__retired__"}';
BEGIN
  SELECT id INTO tpl FROM task_templates
  WHERE name ILIKE '%void cheque%' AND lead_type = 'Purchase' AND is_deleted = false LIMIT 1;
  IF tpl IS NULL THEN
    RAISE EXCEPTION 'Purchase void cheque template not found.';
  END IF;

  -- "Purchaser N" becomes the name in /api/task-form-fields.
  UPDATE task_form_fields SET label = 'Purchaser 1', required = true
  WHERE task_template_id = tpl AND field_type = 'file' AND label IN ('Purchaser 1 – Void Cheque', 'Purchaser 1');
  -- Only shown on multi-party files, so required there.
  UPDATE task_form_fields SET label = 'Purchaser 2', required = true
  WHERE task_template_id = tpl AND field_type = 'file' AND label IN ('Purchaser 2 – Void Cheque (if applicable)', 'Purchaser 2');

  -- Kept for saved answers; not in the redesign.
  UPDATE task_form_fields SET required = false, visible_when = retired
  WHERE task_template_id = tpl
    AND label IN ('Mortgage Payments', 'Whose account should be used for the mortgage payments?');
END $$;
