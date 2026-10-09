-- Purchase property type and resale condo Status Certificate task. Idempotent.
-- building_type, not property_type: leads.property_type is Primary/Investment use.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS building_type text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS building_type text;

-- Allow doc_type 'status_certificate', keeping every existing value.
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
    SELECT 'status_certificate'
  ) s;

  EXECUTE 'ALTER TABLE lead_corporate_docs
             DROP CONSTRAINT IF EXISTS lead_corporate_docs_doc_type_check';
  EXECUTE format(
    'ALTER TABLE lead_corporate_docs
       ADD CONSTRAINT lead_corporate_docs_doc_type_check
       CHECK (doc_type = ANY (ARRAY[%s]::text[]))',
    vals);
END $$;

-- Conversion adds this task only for resale condos.
DO $$
DECLARE
  anchor task_templates%ROWTYPE;
  new_id task_templates.id%TYPE;
BEGIN
  IF EXISTS (
    SELECT 1 FROM task_templates
    WHERE name = 'Status Certificate' AND lead_type = 'Purchase' AND is_deleted = false
  ) THEN
    RAISE NOTICE 'Purchase Status Certificate already exists.';
    RETURN;
  END IF;

  SELECT * INTO anchor FROM task_templates
  WHERE name ILIKE '%agreement of purchase%' AND lead_type = 'Purchase' AND is_deleted = false
  ORDER BY order_index LIMIT 1;
  IF anchor.id IS NULL THEN
    RAISE EXCEPTION 'Purchase APS template not found.';
  END IF;

  UPDATE task_templates SET order_index = order_index + 1
  WHERE lead_type = 'Purchase' AND is_deleted = false AND order_index > anchor.order_index;

  INSERT INTO task_templates
    (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
     is_deleted, is_default, stage_template_id, is_shared, activation_required)
  VALUES
    ('Purchase', anchor.role_type, 'Status Certificate', anchor.order_index + 1,
     anchor.deadline_rule, false, false, true, anchor.stage_template_id, true, false)
  RETURNING id INTO new_id;

  INSERT INTO task_form_fields
    (task_template_id, field_type, label, placeholder, required, order_index, options)
  VALUES
    (new_id, 'file', 'Status certificate', NULL, true, 1,
     jsonb_build_object('accept', '.pdf,.jpg,.jpeg,.png', 'max_mb', 10,
                        'doc_type', 'status_certificate', 'slot_label', 'Status certificate'));
END $$;
