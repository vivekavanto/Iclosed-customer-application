-- Purchase "Void Cheque" task after Home Insurance Policy. Idempotent.

-- Allow doc_type 'void_cheque', keeping every existing value.
DO $$
DECLARE vals text;
BEGIN
  SELECT string_agg(DISTINCT quote_literal(v), ', ') INTO vals
  FROM (
    SELECT (regexp_matches(pg_get_constraintdef(oid), '''([^'']+)''', 'g'))[1] AS v
    FROM pg_constraint
    WHERE conname = 'lead_corporate_docs_doc_type_check'
    UNION
    SELECT DISTINCT doc_type FROM lead_corporate_docs WHERE doc_type IS NOT NULL
    UNION
    SELECT 'void_cheque'
  ) s;

  EXECUTE 'ALTER TABLE lead_corporate_docs
             DROP CONSTRAINT IF EXISTS lead_corporate_docs_doc_type_check';
  EXECUTE format(
    'ALTER TABLE lead_corporate_docs
       ADD CONSTRAINT lead_corporate_docs_doc_type_check
       CHECK (doc_type = ANY (ARRAY[%s]::text[]))',
    vals);
END $$;

DO $$
DECLARE
  anchor  task_templates%ROWTYPE;
  new_id  task_templates.id%TYPE;
  choice  constant text := 'Whose account should be used for the mortgage payments?';
BEGIN
  IF EXISTS (
    SELECT 1 FROM task_templates
    WHERE name = 'Void Cheque' AND lead_type = 'Purchase' AND is_deleted = false
  ) THEN
    RAISE NOTICE 'Purchase Void Cheque already exists.';
    RETURN;
  END IF;

  SELECT * INTO anchor
  FROM task_templates
  WHERE name ILIKE '%home insurance%'
    AND lead_type = 'Purchase'
    AND is_deleted = false
  ORDER BY order_index
  LIMIT 1;

  IF anchor.id IS NULL THEN
    RAISE EXCEPTION 'Purchase "Home Insurance Policy" template not found.';
  END IF;

  UPDATE task_templates
  SET order_index = order_index + 1
  WHERE lead_type = 'Purchase' AND is_deleted = false AND order_index > anchor.order_index;

  INSERT INTO task_templates
    (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
     is_deleted, is_default, stage_template_id, is_shared, activation_required)
  VALUES
    ('Purchase', anchor.role_type, 'Void Cheque', anchor.order_index + 1,
     anchor.deadline_rule, false, false, true, anchor.stage_template_id,
     true, false)
  RETURNING id INTO new_id;

  INSERT INTO task_form_fields
    (task_template_id, field_type, label, placeholder, required, order_index, options)
  VALUES
    (new_id, 'file', 'Purchaser 1 – Void Cheque', NULL, true, 1,
     jsonb_build_object('accept', '.pdf,.jpg,.jpeg,.png', 'max_mb', 10, 'doc_type', 'void_cheque')),
    (new_id, 'file', 'Purchaser 2 – Void Cheque (if applicable)', NULL, false, 2,
     jsonb_build_object('accept', '.pdf,.jpg,.jpeg,.png', 'max_mb', 10, 'doc_type', 'void_cheque',
                        'multi_party_only', true)),
    (new_id, 'note', 'Mortgage Payments', NULL, false, 3,
     jsonb_build_object('variant', 'section', 'multi_party_only', true,
                        'text', 'Please select the bank account your lender should use to withdraw your mortgage payments.')),
    (new_id, 'select', choice, 'Select an account', true, 4,
     '[{"label":"Purchaser 1","value":"Purchaser 1"},
       {"label":"Purchaser 2","value":"Purchaser 2"}]'::jsonb);

  -- Hides the select with the note on single-purchaser files.
  UPDATE task_form_fields
  SET options = options || jsonb_build_object('attach_to', choice)
  WHERE task_template_id = new_id AND label = 'Mortgage Payments';
END $$;

SELECT t.name, t.order_index, t.is_shared, f.order_index AS field_order, f.field_type, f.required, f.label
FROM task_templates t
LEFT JOIN task_form_fields f ON f.task_template_id = t.id
WHERE t.lead_type = 'Purchase' AND t.is_deleted = false
  AND (t.name = 'Void Cheque' OR t.name ILIKE '%home insurance%')
ORDER BY t.order_index, f.order_index;
