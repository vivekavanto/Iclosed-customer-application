-- Spouse name question + consent notice (Married AND Primary). Idempotent.

-- ── 1. Allow the new field_type ──────────────────────────────────────────────
DO $$
DECLARE vals text;
BEGIN
  SELECT string_agg(quote_literal(field_type), ', ') INTO vals
  FROM (
    SELECT unnest(ARRAY[
      'text','phone','email','date','select','textarea','file','checkbox',
      'number','radio','note','shares','spouse'
    ]) AS field_type
    UNION
    SELECT DISTINCT field_type FROM task_form_fields WHERE field_type IS NOT NULL
  ) s;

  EXECUTE 'ALTER TABLE task_form_fields
             DROP CONSTRAINT IF EXISTS task_form_fields_field_type_check';
  EXECUTE format(
    'ALTER TABLE task_form_fields
       ADD CONSTRAINT task_form_fields_field_type_check
       CHECK (field_type = ANY (ARRAY[%s]::text[]))',
    vals);
END $$;

-- ── 2. Add the question + notice to both Personal Information templates ─────
DO $$
DECLARE
  tpl           record;
  marital_lbl   text;
  marital_opts  jsonb;
  marital_idx   integer;
  married_val   text;
  residence_lbl text;
  residence_val text;
  rule          jsonb;
  notice        text;
  spouse_label  constant text := 'Enter your spouse''s name';
  notice_label  constant text := 'Spousal consent notice';
BEGIN
  FOR tpl IN
    SELECT id, name, lead_type
    FROM task_templates
    WHERE name ILIKE '%personal information%'
      AND lead_type IN ('Purchase', 'Sale')
      AND is_deleted = false
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM task_form_fields
      WHERE task_template_id = tpl.id AND label = spouse_label
    );

    SELECT label, options, order_index INTO marital_lbl, marital_opts, marital_idx
    FROM task_form_fields
    WHERE task_template_id = tpl.id AND label ILIKE '%marital%'
    ORDER BY order_index
    LIMIT 1;

    SELECT e->>'value' INTO married_val
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(marital_opts) = 'array' THEN marital_opts ELSE '[]'::jsonb END
         ) e
    WHERE lower(trim(e->>'label')) = 'married' OR lower(trim(e->>'value')) = 'married'
    LIMIT 1;

    SELECT f.label,
           COALESCE(
             (SELECT e->>'value'
                FROM jsonb_array_elements(
                       CASE WHEN jsonb_typeof(f.options) = 'array' THEN f.options ELSE '[]'::jsonb END
                     ) e
               WHERE e->>'label' ILIKE 'primary%' OR e->>'value' ILIKE 'primary%'
               LIMIT 1),
             'primary')
      INTO residence_lbl, residence_val
    FROM task_form_fields f
    WHERE f.task_template_id = tpl.id AND f.label ILIKE '%primary residence%'
    ORDER BY f.order_index
    LIMIT 1;

    IF marital_lbl IS NULL OR married_val IS NULL OR residence_lbl IS NULL THEN
      RAISE NOTICE 'Skipped % (%): marital=% married=% residence=%',
        tpl.name, tpl.lead_type, marital_lbl, married_val, residence_lbl;
      CONTINUE;
    END IF;

    rule := jsonb_build_object(
      'all', jsonb_build_array(
        jsonb_build_object('field_label', marital_lbl, 'equals', married_val),
        jsonb_build_object('field_label', residence_lbl, 'equals', residence_val)
      )
    );

    notice := CASE WHEN tpl.lead_type = 'Sale'
      THEN 'Because this is your matrimonial home, your spouse must sign as a consenting spouse even if they are not on title. We will include them in the signing appointment.'
      ELSE 'Because this will be your matrimonial home, your spouse must sign as a consenting spouse even if they are not going on title. We will include them in the signing appointment.'
    END;

    -- Free two slots directly below the marital status question.
    UPDATE task_form_fields
    SET order_index = order_index + 2
    WHERE task_template_id = tpl.id
      AND order_index > marital_idx;

    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options)
    VALUES
      (tpl.id, 'spouse', spouse_label, 'Full legal name as it appears on their ID',
       false, marital_idx + 1,
       jsonb_build_object('visible_when', rule)),
      (tpl.id, 'note', notice_label, NULL, false, marital_idx + 2,
       jsonb_build_object(
         'variant', 'warning',
         'collapsible', false,
         'attach_to', spouse_label,
         'text', notice,
         'visible_when', rule));

    RAISE NOTICE 'Added to % (%) at order_index %',
      tpl.name, tpl.lead_type, marital_idx + 1;
  END LOOP;
END $$;

-- ── 3. Verify ────────────────────────────────────────────────────────────────
SELECT t.lead_type, f.order_index, f.field_type, f.required, f.label,
       f.options -> 'visible_when' AS visible_when
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE t.name ILIKE '%personal information%'
  AND t.is_deleted = false
ORDER BY t.lead_type, f.order_index;
