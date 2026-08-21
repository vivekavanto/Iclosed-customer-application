-- Sale-side Personal Information drops five questions that only matter on a
-- purchase: prior property ownership, the 183-days-outside-Canada question,
-- occupation, business/employer phone, and source of funds.
--
-- Reversible via sql/rollback_sale_personal_info_remove_questions.sql.

-- Preview before running, if you want to see what will go:
-- SELECT t.name, t.lead_type, f.label FROM task_form_fields f
-- JOIN task_templates t ON t.id = f.task_template_id
-- WHERE t.is_deleted = false AND t.name ILIKE '%personal info%'
--   AND lower(trim(t.lead_type)) = 'sale'
--   AND (f.label ILIKE '%ever owned%' OR f.label ILIKE '%183%'
--        OR f.label ILIKE '%occupation%' OR f.label ILIKE '%employer%'
--        OR (f.label ILIKE '%business%' AND f.label ILIKE '%phone%')
--        OR f.label ILIKE '%source of funds%');

BEGIN;

-- Unlink first: the answers survive, and the delete below cannot cascade.
UPDATE task_responses r
SET field_id = NULL
WHERE r.field_id IN (
  SELECT f.id
  FROM task_form_fields f
  JOIN task_templates t ON t.id = f.task_template_id
  WHERE t.is_deleted = false
    AND t.name ILIKE '%personal info%'
    AND lower(trim(t.lead_type)) = 'sale'
    AND (
         f.label ILIKE '%ever owned%'
      OR f.label ILIKE '%183%'
      OR f.label ILIKE '%occupation%'
      OR f.label ILIKE '%employer%'
      OR (f.label ILIKE '%business%' AND f.label ILIKE '%phone%')
      OR f.label ILIKE '%source of funds%'
    )
);

DELETE FROM task_form_fields f
USING task_templates t
WHERE t.id = f.task_template_id
  AND t.is_deleted = false
  AND t.name ILIKE '%personal info%'
  AND lower(trim(t.lead_type)) = 'sale'
  AND (
       f.label ILIKE '%ever owned%'
    OR f.label ILIKE '%183%'
    OR f.label ILIKE '%occupation%'
    OR f.label ILIKE '%employer%'
    OR (f.label ILIKE '%business%' AND f.label ILIKE '%phone%')
    OR f.label ILIKE '%source of funds%'
  );

COMMIT;

-- Verify: the five labels should be gone from Sale and still present on Purchase.
SELECT t.name, t.lead_type, f.order_index, f.field_type, f.label
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE t.name ILIKE '%personal info%' AND t.is_deleted = false
ORDER BY t.lead_type, f.order_index;
