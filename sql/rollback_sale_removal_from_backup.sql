-- Undoes sale_personal_info_remove_questions.sql from the tables written by
-- prod_backup_before_sale_removal.sql.

BEGIN;

INSERT INTO task_form_fields
SELECT * FROM backups.sale_fields_20260825
ON CONFLICT (id) DO NOTHING;

UPDATE task_responses r
SET field_id = b.field_id
FROM backups.sale_response_links_20260825 b
WHERE r.id = b.response_id
  AND r.field_id IS NULL;

COMMIT;

SELECT t.name, t.lead_type, f.order_index, f.field_type, f.label
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE t.name ILIKE '%personal info%' AND t.is_deleted = false
ORDER BY t.lead_type, f.order_index;
