-- Adds "Have you paid your tax bill in full?" (Yes/No/Partial) to the Latest
-- Property Tax Bill task, with Proof of Payment on Yes/Partial and a note on No.
--
-- Deploy the app code FIRST — older code can't parse 'radio'/'note'/equals_any
-- and the task becomes unsubmittable on "No".
--
-- Part 1 widens the field_type CHECK ('radio' and 'note' are new); Part 2 adds
-- the rows. Re-running is a no-op. Run in dev and prod.

  BEGIN;

  -- ── Part 1: allow the two new field types ──

  DO $$
  DECLARE missing text;
  BEGIN
    SELECT string_agg(DISTINCT field_type, ', ') INTO missing
    FROM task_form_fields
    WHERE field_type NOT IN (
      'text','phone','email','date','select','textarea','file','checkbox','number',
      'radio','note'
    );
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION
        'Refusing to narrow the constraint — field_type(s) in use but not listed: %',
        missing;
    END IF;
  END $$;

  ALTER TABLE task_form_fields
    DROP CONSTRAINT IF EXISTS task_form_fields_field_type_check;

  ALTER TABLE task_form_fields
    ADD CONSTRAINT task_form_fields_field_type_check
    CHECK (field_type IN (
      'text','phone','email','date','select','textarea','file','checkbox','number',
      'radio','note'
    ));

  -- ── Part 2: the three form fields ──

  -- The existing "Latest Property Tax Bill" upload sits at order_index 8; these
  -- three follow it. Orders are relative only, so no shifting is needed.

  -- 1. The question itself.
  INSERT INTO task_form_fields
    (task_template_id, field_type, label, placeholder, required, order_index, options)
  SELECT t.id, 'radio', 'Have you paid your tax bill in full?', NULL, true, 9,
        '[{"label":"Yes","value":"Yes"},{"label":"No","value":"No"},{"label":"Partial","value":"Partial"}]'::jsonb
  FROM task_templates t
  WHERE t.name ILIKE '%latest property tax bill%'
    AND t.lead_type = 'Sale'
    AND t.is_deleted = false
    AND NOT EXISTS (
          SELECT 1 FROM task_form_fields x
          WHERE x.task_template_id = t.id
            AND x.label = 'Have you paid your tax bill in full?'
        );

  -- 2. Proof of Payment — shown for Yes or Partial, required whenever visible.
  INSERT INTO task_form_fields
    (task_template_id, field_type, label, placeholder, required, order_index, options)
  SELECT t.id, 'file', 'Proof of Payment', NULL, true, 10,
        '{"accept":".pdf,.jpg,.jpeg,.png","max_mb":10,"doc_type":"property_tax_proof_of_payment",
          "visible_when":{"field_label":"Have you paid your tax bill in full?","equals_any":["Yes","Partial"]}}'::jsonb
  FROM task_templates t
  WHERE t.name ILIKE '%latest property tax bill%'
    AND t.lead_type = 'Sale'
    AND t.is_deleted = false
    AND NOT EXISTS (
          SELECT 1 FROM task_form_fields x
          WHERE x.task_template_id = t.id
            AND x.label = 'Proof of Payment'
        );

  -- 3. The "No" note. field_type 'note' renders the label as a callout and is
  --    never submitted as a response.
  INSERT INTO task_form_fields
    (task_template_id, field_type, label, placeholder, required, order_index, options)
  SELECT t.id, 'note',
        'Please note that we will be paying your portion of the taxes from your sale proceeds.',
        NULL, false, 11,
        '{"visible_when":{"field_label":"Have you paid your tax bill in full?","equals":"No"}}'::jsonb
  FROM task_templates t
  WHERE t.name ILIKE '%latest property tax bill%'
    AND t.lead_type = 'Sale'
    AND t.is_deleted = false
    AND NOT EXISTS (
          SELECT 1 FROM task_form_fields x
          WHERE x.task_template_id = t.id
            AND x.field_type = 'note'
        );

  COMMIT;

  -- Verify:
  -- SELECT f.order_index, f.field_type, f.required, f.label, f.options
  -- FROM task_form_fields f
  -- JOIN task_templates t ON t.id = f.task_template_id
  -- WHERE t.name ILIKE '%latest property tax bill%' AND t.is_deleted = false
  -- ORDER BY f.order_index;
