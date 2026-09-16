-- Renames the "How Will You Hold Title?" task to "Ownership shares" (template + existing tasks). Idempotent.
-- Deploy the matching taskKinds.ts change first.

BEGIN;

UPDATE tasks t
SET title = 'Ownership shares'
FROM task_templates tt
WHERE t.task_template_id = tt.id
  AND tt.name = 'How Will You Hold Title?'
  AND t.title <> 'Ownership shares';

UPDATE tasks
SET title = 'Ownership shares'
WHERE task_template_id IS NULL AND title = 'How Will You Hold Title?';

UPDATE task_templates
SET name = 'Ownership shares'
WHERE name = 'How Will You Hold Title?';

COMMIT;

SELECT tt.lead_type, tt.name, count(t.id) AS tasks
FROM task_templates tt
LEFT JOIN tasks t ON t.task_template_id = tt.id AND t.is_deleted = false
WHERE tt.name IN ('Ownership shares', 'How Will You Hold Title?')
GROUP BY tt.lead_type, tt.name;
