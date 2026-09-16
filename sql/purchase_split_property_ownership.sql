-- Purchase Personal Info: split "ever owned a property" per person when Married AND Primary. Idempotent.

ALTER TABLE task_form_fields ADD COLUMN IF NOT EXISTS visible_when jsonb NULL;

DO $$
DECLARE
  tpl           record;
  marital_lbl   text;
  marital_opts  jsonb;
  married_val   text;
  residence_lbl text;
  residence_val text;
  combined_id   uuid;
  combined_idx  integer;
  base          jsonb;
  yes_no        constant jsonb := '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]';
  self_lbl      constant text := 'Have you ever owned a property?';
  spouse_lbl    constant text := 'Has your spouse ever owned a property?';
  sold_lbl      constant text := 'Was the property sold before the date of marriage?';
BEGIN
  FOR tpl IN
    SELECT id, name
    FROM task_templates
    WHERE name ILIKE '%personal information%'
      AND lead_type = 'Purchase'
      AND is_deleted = false
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM task_form_fields WHERE task_template_id = tpl.id AND label = self_lbl
    );

    SELECT label, options INTO marital_lbl, marital_opts
    FROM task_form_fields
    WHERE task_template_id = tpl.id AND label ILIKE '%marital%'
    ORDER BY order_index LIMIT 1;

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
    ORDER BY f.order_index LIMIT 1;

    SELECT id, order_index INTO combined_id, combined_idx
    FROM task_form_fields
    WHERE task_template_id = tpl.id AND label ILIKE '%ever owned%'
    ORDER BY order_index LIMIT 1;

    IF marital_lbl IS NULL OR married_val IS NULL OR residence_lbl IS NULL OR combined_id IS NULL THEN
      RAISE NOTICE 'Skipped %: marital=% married=% residence=% ever_owned=%',
        tpl.name, marital_lbl, married_val, residence_lbl, combined_id;
      CONTINUE;
    END IF;

    base := jsonb_build_array(
      jsonb_build_object('field_label', marital_lbl, 'equals', married_val),
      jsonb_build_object('field_label', residence_lbl, 'equals', residence_val));

    -- The combined question stays for everyone else.
    UPDATE task_form_fields
    SET visible_when = jsonb_build_object('any', jsonb_build_array(
          jsonb_build_object('field_label', marital_lbl, 'not_equals', married_val),
          jsonb_build_object('field_label', residence_lbl, 'not_equals', residence_val)))
    WHERE id = combined_id;

    UPDATE task_form_fields
    SET order_index = order_index + 5
    WHERE task_template_id = tpl.id AND order_index > combined_idx;

    INSERT INTO task_form_fields
      (task_template_id, field_type, label, placeholder, required, order_index, options, visible_when)
    VALUES
      (tpl.id, 'select', self_lbl, 'Select an option', false, combined_idx + 1, yes_no,
       jsonb_build_object('all', base)),
      (tpl.id, 'note', 'First-time buyer rebate notice (you)', NULL, false, combined_idx + 2,
       jsonb_build_object(
         'variant', 'warning', 'collapsible', false,
         'text', 'Please note the first time buyer rebate is not applicable as you have bought a property in the past.',
         'visible_when', jsonb_build_object('all', base || jsonb_build_array(
           jsonb_build_object('field_label', self_lbl, 'equals', 'yes')))),
       NULL),
      (tpl.id, 'select', spouse_lbl, 'Select an option', false, combined_idx + 3, yes_no,
       jsonb_build_object('all', base)),
      (tpl.id, 'select', sold_lbl, 'Select an option', false, combined_idx + 4, yes_no,
       jsonb_build_object('all', base || jsonb_build_array(
         jsonb_build_object('field_label', spouse_lbl, 'equals', 'yes')))),
      (tpl.id, 'note', 'First-time buyer rebate notice (spouse)', NULL, false, combined_idx + 5,
       jsonb_build_object(
         'variant', 'warning', 'collapsible', false,
         'text', 'You are not entitled to the first time buyer rebate as your spouse owns a property.',
         'visible_when', jsonb_build_object('all', base || jsonb_build_array(
           jsonb_build_object('field_label', spouse_lbl, 'equals', 'yes'),
           jsonb_build_object('field_label', sold_lbl, 'equals', 'no')))),
       NULL);

    RAISE NOTICE 'Split ownership question on % at order_index %', tpl.name, combined_idx;
  END LOOP;
END $$;

SELECT f.order_index, f.field_type, f.label,
       COALESCE(f.visible_when, f.options -> 'visible_when') AS visible_when
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE t.name ILIKE '%personal information%' AND t.lead_type = 'Purchase' AND t.is_deleted = false
ORDER BY f.order_index;
