-- Run immediately before sale_personal_info_remove_questions.sql. Snapshots the
-- five fields and the answer links it clears. Ids only, no client answers.
-- Outside `public` so PostgREST never exposes it.

CREATE SCHEMA IF NOT EXISTS backups;

DROP TABLE IF EXISTS backups.sale_fields_20260825;
CREATE TABLE backups.sale_fields_20260825 AS
SELECT f.*
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
  );

DROP TABLE IF EXISTS backups.sale_response_links_20260825;
CREATE TABLE backups.sale_response_links_20260825 AS
SELECT r.id AS response_id, r.field_id
FROM task_responses r
WHERE r.field_id IN (SELECT id FROM backups.sale_fields_20260825);

SELECT (SELECT count(*) FROM backups.sale_fields_20260825)         AS fields_backed_up,
       (SELECT count(*) FROM backups.sale_response_links_20260825) AS answer_links_backed_up;
