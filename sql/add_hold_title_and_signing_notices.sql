-- Personal Information task: hold-title question + explainer + ILA disclaimer
-- (Purchase only), and the virtual signing fee notice (Purchase and Sale).
--
-- Templates are matched by name, not id, so this works on any environment.
-- Requires the PersonalInfoTaskDrawer.tsx 'note' support to be deployed first.

BEGIN;

-- Allow 'note' as a field_type. Rebuilt from the known list UNION values
-- already in use, so it cannot fail against existing rows.
DO $$
DECLARE vals text;
BEGIN
  SELECT string_agg(quote_literal(field_type), ', ') INTO vals
  FROM (
    SELECT unnest(ARRAY[
      'text','phone','email','date','select','textarea','file','checkbox',
      'number','radio','note'
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

-- Three slots above the signing question, on Purchase templates.
UPDATE task_form_fields f
SET order_index = f.order_index + 3
FROM task_templates t
WHERE f.task_template_id = t.id
  AND t.name ILIKE '%personal info%'
  AND lower(trim(t.lead_type)) = 'purchase'
  AND t.is_deleted = false
  AND f.order_index >= (
        SELECT min(s.order_index) FROM task_form_fields s
        WHERE s.task_template_id = t.id
          AND s.label ILIKE '%in person or virtually%')
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = t.id
          AND x.label = 'How would you like to hold title: joint vs tenants in common?');

-- Explainer, attached to the question so it renders between label and dropdown.
INSERT INTO task_form_fields
  (task_template_id, field_type, label, placeholder, required, order_index, options)
SELECT t.id, 'note', 'Understanding Joint Tenants vs Tenants in Common', NULL, false,
       (SELECT min(s.order_index) - 3 FROM task_form_fields s
         WHERE s.task_template_id = t.id AND s.label ILIKE '%in person or virtually%'),
       '{
         "variant": "info",
         "collapsible": false,
         "display": "badge",
         "attach_to": "How would you like to hold title: joint vs tenants in common?",
         "disclaimer": "Please note if you go with this option, the parties with lower shares will need to obtain Independent Legal Advice (ILA) as they are taking full mortgage liability for lower shares. This needs to be obtained from another lawyer outside our firm and they will have their own fees. If you have questions about this, please contact us.",
         "sections": [
           {
             "heading": "A) Joint Tenants",
             "items": [
               {"term": "1. Right of Survivorship",
                "body": "Upon the death of one joint tenant, their interest in the property automatically passes to the surviving joint tenants. This means that the property does not go through probate and is not inherited by the deceased tenant''s heirs."},
               {"term": "2. Equal Ownership",
                "body": "Each joint tenant has an equal share in the property, regardless of how much each contributed to the purchase price."},
               {"term": "3. Unity of Time, Title, Interest, and Possession",
                "body": "All joint tenants must acquire their interest at the same time, through the same transaction, have an equal interest, and have an equal right to possess the whole property."}
             ]
           },
           {
             "heading": "B) Tenants in Common",
             "items": [
               {"term": "1. No Right of Survivorship",
                "body": "Unlike joint tenancy, there is no right of survivorship in tenancy in common. When a tenant in common dies, their share of the property is passed on according to their will or the laws of intestacy, rather than automatically going to the other co-owners."},
               {"term": "2. Unequal Shares",
                "body": "Tenants in common can own unequal shares of the property. For example, one tenant might own 50% of the property, another might own 30%, and a third might own 20%."},
               {"term": "3. Separate Interests",
                "body": "Each tenant in common holds an individual, undivided ownership interest in the property. This means that although the shares can be unequal, each owner has the right to use and enjoy the entire property. Regardless of the shares each individual owns all the owners are equally liable towards the mortgage."},
               {"term": "4. Transferability",
                "body": "Each tenant in common can sell, transfer, or mortgage their share of the property without the consent of the other co-owners. This can be done during their lifetime or bequeathed in their will."}
             ]
           }
         ]
       }'::jsonb
FROM task_templates t
WHERE t.name ILIKE '%personal info%'
  AND lower(trim(t.lead_type)) = 'purchase'
  AND t.is_deleted = false
  AND EXISTS (
        SELECT 1 FROM task_form_fields s
        WHERE s.task_template_id = t.id AND s.label ILIKE '%in person or virtually%')
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = t.id
          AND x.label = 'Understanding Joint Tenants vs Tenants in Common');

-- The question itself.
INSERT INTO task_form_fields
  (task_template_id, field_type, label, placeholder, required, order_index, options)
SELECT t.id, 'select',
       'How would you like to hold title: joint vs tenants in common?',
       'Select how you will hold title', true,
       (SELECT min(s.order_index) - 2 FROM task_form_fields s
         WHERE s.task_template_id = t.id AND s.label ILIKE '%in person or virtually%'),
       '[{"label":"Joint Tenants","value":"Joint Tenants"},
         {"label":"Tenants in Common","value":"Tenants in Common"}]'::jsonb
FROM task_templates t
WHERE t.name ILIKE '%personal info%'
  AND lower(trim(t.lead_type)) = 'purchase'
  AND t.is_deleted = false
  AND EXISTS (
        SELECT 1 FROM task_form_fields s
        WHERE s.task_template_id = t.id AND s.label ILIKE '%in person or virtually%')
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = t.id
          AND x.label = 'How would you like to hold title: joint vs tenants in common?');

-- ILA disclaimer, shown only for Tenants in Common.
INSERT INTO task_form_fields
  (task_template_id, field_type, label, placeholder, required, order_index, options)
SELECT t.id, 'note', 'Independent Legal Advice (ILA) notice', NULL, false,
       (SELECT min(s.order_index) - 1 FROM task_form_fields s
         WHERE s.task_template_id = t.id AND s.label ILIKE '%in person or virtually%'),
       '{
         "variant": "warning",
         "collapsible": false,
         "text": "Please note if you go with this option, the parties with lower shares will need to obtain Independent Legal Advice (ILA) as they are taking full mortgage liability for lower shares. This needs to be obtained from another lawyer outside our firm and they will have their own fees. If you have questions about this, please contact us.",
         "visible_when": {
           "field_label": "How would you like to hold title: joint vs tenants in common?",
           "equals": "Tenants in Common"
         }
       }'::jsonb
FROM task_templates t
WHERE t.name ILIKE '%personal info%'
  AND lower(trim(t.lead_type)) = 'purchase'
  AND t.is_deleted = false
  AND EXISTS (
        SELECT 1 FROM task_form_fields s
        WHERE s.task_template_id = t.id AND s.label ILIKE '%in person or virtually%')
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = t.id
          AND x.label = 'Independent Legal Advice (ILA) notice');

-- One slot below the signing question, on every live template that has it.
UPDATE task_form_fields f
SET order_index = f.order_index + 1
FROM task_templates t
WHERE f.task_template_id = t.id
  AND t.is_deleted = false
  AND f.order_index > (
        SELECT min(s.order_index) FROM task_form_fields s
        WHERE s.task_template_id = t.id AND s.label ILIKE '%in person or virtually%')
  AND EXISTS (
        SELECT 1 FROM task_form_fields s
        WHERE s.task_template_id = t.id AND s.label ILIKE '%in person or virtually%')
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = t.id AND x.label = 'Virtual signing fee notice');

-- Virtual signing fee notice. The value meaning "virtually" is read from the
-- question's own options rather than hardcoded.
INSERT INTO task_form_fields
  (task_template_id, field_type, label, placeholder, required, order_index, options)
SELECT t.id, 'note', 'Virtual signing fee notice', NULL, false,
       (SELECT min(s.order_index) + 1 FROM task_form_fields s
         WHERE s.task_template_id = t.id AND s.label ILIKE '%in person or virtually%'),
       jsonb_build_object(
         'variant', 'warning',
         'collapsible', false,
         'text', 'Please note: If you choose virtual signing, we''ll verify your identity through Treefort, a secure online ID verification service, and an additional fee of $25 per person will apply. This fee doesn''t apply to in-person signing.',
         'visible_when', jsonb_build_object(
           'field_label', (
             SELECT s.label FROM task_form_fields s
             WHERE s.task_template_id = t.id AND s.label ILIKE '%in person or virtually%'
             ORDER BY s.order_index LIMIT 1),
           'equals', COALESCE(
             (SELECT elem ->> 'value'
                FROM (SELECT s.options AS opts FROM task_form_fields s
                       WHERE s.task_template_id = t.id
                         AND s.label ILIKE '%in person or virtually%'
                         AND jsonb_typeof(s.options) = 'array'
                       ORDER BY s.order_index LIMIT 1) o,
                     jsonb_array_elements(o.opts) elem
               WHERE elem ->> 'value' ILIKE '%virtual%'
                  OR elem ->> 'label' ILIKE '%virtual%'
               LIMIT 1),
             'Virtually')
         )
       )
FROM task_templates t
WHERE t.is_deleted = false
  AND EXISTS (
        SELECT 1 FROM task_form_fields s
        WHERE s.task_template_id = t.id AND s.label ILIKE '%in person or virtually%')
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = t.id AND x.label = 'Virtual signing fee notice');

-- Source of funds is a single-line text field, like the other questions.
UPDATE task_form_fields
SET field_type = 'text'
WHERE label ILIKE '%source of funds%'
  AND field_type = 'textarea';

COMMIT;

-- Verify: explainer, hold-title select, ILA notice, signing question,
-- virtual fee notice.
SELECT t.name, t.lead_type, f.order_index, f.field_type, f.label
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE t.name ILIKE '%personal info%' AND t.is_deleted = false
ORDER BY t.lead_type, f.order_index;
