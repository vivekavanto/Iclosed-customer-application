-- Personal Information (Purchase + Sale): a file upload for the separation
-- agreement / divorce certificate, shown only when marital status is Divorced or
-- Separated AND the property is the primary residence. Both must hold, so it uses
-- the `visible_when.all` shape (see src/lib/visibleWhen.ts).
--
-- required stays false: the drawer treats a conditional field as required
-- whenever it is visible, so it blocks submit only once both answers match.
--
-- Labels differ per template and are read from it, not hardcoded. The marital
-- list covers every Separated value either side offers (Purchase collapsed
-- formal/no-formal into "separated").
--
-- Apply once in the Supabase SQL editor, dev and prod. Run the WHOLE file. Each
-- step is self-contained and idempotent — no wrapping transaction, because the
-- editor's pooled connections can put each statement on a different backend.

-- ── 1. Allow the new doc_type ────────────────────────────────────────────────
-- Known list UNION what's already in the table, so legacy values can't break the
-- rebuild. Without this, save-doc-metadata fails the CHECK and the file is lost.
DO $$
DECLARE vals text;
BEGIN
  SELECT string_agg(quote_literal(doc_type), ', ') INTO vals
  FROM (
    SELECT unnest(ARRAY[
      'Article of Incorporation', 'Corporation Profile',
      'Special Shareholder Agreement', 'Directors Resolution', 'Other',
      'aps', 'identification', 'home_insurance', 'mortgage', 'document',
      'aps_purchase', 'aps_sale', 'retainer_agreement', 'void_cheque',
      'property_tax_proof_of_payment', 'separation_agreement'
    ]) AS doc_type
    UNION
    SELECT DISTINCT doc_type FROM lead_corporate_docs WHERE doc_type IS NOT NULL
  ) s;

  EXECUTE 'ALTER TABLE lead_corporate_docs
             DROP CONSTRAINT IF EXISTS lead_corporate_docs_doc_type_check';
  EXECUTE format(
    'ALTER TABLE lead_corporate_docs
       ADD CONSTRAINT lead_corporate_docs_doc_type_check
       CHECK (doc_type = ANY (ARRAY[%s]::text[]))',
    vals);
END $$;

-- ── 2. Add the upload to both Personal Information templates ─────────────────
DO $$
DECLARE
  tpl           record;
  marital_lbl   text;
  residence_lbl text;
  residence_idx integer;
  new_label     constant text := 'Separation Agreement or Divorce Certificate';
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
      WHERE task_template_id = tpl.id AND label = new_label
    );

    SELECT label INTO marital_lbl
    FROM task_form_fields
    WHERE task_template_id = tpl.id AND label ILIKE '%marital%'
    ORDER BY order_index
    LIMIT 1;

    SELECT label, order_index INTO residence_lbl, residence_idx
    FROM task_form_fields
    WHERE task_template_id = tpl.id AND label ILIKE '%primary residence%'
    ORDER BY order_index
    LIMIT 1;

    -- The drawer fails open on a parent it can't find, so a half-matched rule
    -- would show the upload to everyone.
    IF marital_lbl IS NULL OR residence_lbl IS NULL THEN
      RAISE NOTICE 'Skipped % (%): marital=% residence=%',
        tpl.name, tpl.lead_type, marital_lbl, residence_lbl;
      CONTINUE;
    END IF;

    -- Free the slot directly below the primary-residence question.
    UPDATE task_form_fields
    SET order_index = order_index + 1
    WHERE task_template_id = tpl.id
      AND order_index > residence_idx;

    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options)
    VALUES (
      tpl.id, 'file', new_label, NULL, false, residence_idx + 1,
      jsonb_build_object(
        'accept', '.pdf,.jpg,.jpeg,.png',
        'max_mb', 10,
        'doc_type', 'separation_agreement',
        'description', 'We review this to confirm how title and any interest in the property is to be held, and whether spousal consent is required.',
        'visible_when', jsonb_build_object(
          'all', jsonb_build_array(
            jsonb_build_object(
              'field_label', marital_lbl,
              'equals_any', jsonb_build_array(
                'divorced', 'separated', 'separated_formal', 'separated_no_formal')
            ),
            jsonb_build_object(
              'field_label', residence_lbl,
              'equals', 'primary'
            )
          )
        )
      )
    );

    RAISE NOTICE 'Added to % (%) at order_index %',
      tpl.name, tpl.lead_type, residence_idx + 1;
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
