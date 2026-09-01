-- Undoes add_ownership_shares_field.sql. The widened field_type CHECK stays,
-- so the add script can be re-run once the matching code is deployed.

BEGIN;

UPDATE task_responses
SET field_id = NULL
WHERE field_id IN (SELECT id FROM task_form_fields WHERE field_type = 'shares');

DELETE FROM task_form_fields WHERE field_type = 'shares';

COMMIT;

SELECT count(*) AS shares_fields_remaining FROM task_form_fields WHERE field_type = 'shares';
