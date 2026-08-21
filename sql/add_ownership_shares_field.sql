-- Personal Information task: the ownership-shares box (one row per owner, name
-- + % share) shown only when title is held as Tenants in Common.
--
-- Templates are matched by name, not id, so this works on any environment.
-- Requires the PersonalInfoTaskDrawer.tsx 'shares' support to be deployed first.

BEGIN;

-- Allow 'shares' as a field_type. Rebuilt from the known list UNION values
-- already in use, so it cannot fail against existing rows.
DO $$
DECLARE vals text;
BEGIN
  SELECT string_agg(quote_literal(field_type), ', ') INTO vals
  FROM (
    SELECT unnest(ARRAY[
      'text','phone','email','date','select','textarea','file','checkbox',
      'number','radio','note','shares'
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

-- One slot below the ILA notice, on every template that carries the hold-title
-- question, so the box lands between that notice and whatever follows it.
UPDATE task_form_fields f
SET order_index = f.order_index + 1
FROM task_templates t
WHERE f.task_template_id = t.id
  AND t.is_deleted = false
  AND f.order_index > (
        SELECT min(s.order_index) FROM task_form_fields s
        WHERE s.task_template_id = t.id
          AND s.label = 'Independent Legal Advice (ILA) notice')
  AND EXISTS (
        SELECT 1 FROM task_form_fields s
        WHERE s.task_template_id = t.id
          AND s.label = 'Independent Legal Advice (ILA) notice')
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = t.id
          AND x.label = 'Ownership shares');

-- The box itself. visible_when ties it to "Tenants in Common"; the drawer treats
-- a conditional field as required whenever it is visible, and /api/task-form-fields
-- drops it along with the hold-title question on a single-party transaction.
INSERT INTO task_form_fields
  (task_template_id, field_type, label, placeholder, required, order_index, options)
SELECT t.id, 'shares', 'Ownership shares', NULL, false,
       (SELECT min(s.order_index) + 1 FROM task_form_fields s
         WHERE s.task_template_id = t.id
           AND s.label = 'Independent Legal Advice (ILA) notice'),
       '{
         "visible_when": {
           "field_label": "How would you like to hold title: joint vs tenants in common?",
           "equals": "Tenants in Common"
         }
       }'::jsonb
FROM task_templates t
WHERE t.is_deleted = false
  AND EXISTS (
        SELECT 1 FROM task_form_fields s
        WHERE s.task_template_id = t.id
          AND s.label = 'Independent Legal Advice (ILA) notice')
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = t.id
          AND x.label = 'Ownership shares');

COMMIT;

-- Verify: hold-title question, ILA notice, then the shares box.
SELECT t.name, t.lead_type, f.order_index, f.field_type, f.label,
       f.options -> 'visible_when' AS visible_when
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE t.name ILIKE '%personal info%' AND t.is_deleted = false
ORDER BY t.lead_type, f.order_index;
