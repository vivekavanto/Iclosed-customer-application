-- Rollback for sale_personal_info_remove_questions.sql — restores the five Sale
-- questions with their original ids, and re-links the answers whose field_id
-- that migration cleared.

BEGIN;

INSERT INTO task_form_fields
  (id, task_template_id, field_type, label, placeholder, required, order_index, options)
VALUES
  ('fd4d20c7-a432-481f-8266-0cca2a268bcc', '452a6427-954a-46be-b44e-21ecbdcfa908', 'select', 'In the past 365 days, have you lived outside of Canada for 183 or more days?', 'Select an option', true, 9, '[{"label": "No", "value": "no"}, {"label": "Yes", "value": "yes"}]'::jsonb),
  ('14b13a79-4577-4dda-bde4-8df3f68b32f1', '452a6427-954a-46be-b44e-21ecbdcfa908', 'text', 'Occupation', 'e.g. Engineer', true, 10, NULL),
  ('a5ac0edd-f29c-41fd-bfae-e0b2d0e69ef5', '452a6427-954a-46be-b44e-21ecbdcfa908', 'phone', 'Business/Employer Phone', '(416) 555-1234', false, 11, NULL),
  ('d6e9f73f-15c8-4082-9755-45eb488d34ac', '452a6427-954a-46be-b44e-21ecbdcfa908', 'text', 'What are your source of funds for the sale?', 'e.g. Employment income, savings, gift from family...', true, 12, NULL),
  ('4ffaa679-410b-49ce-b586-0910bf787047', '452a6427-954a-46be-b44e-21ecbdcfa908', 'select', 'Have you or your spouse ever owned a property?', 'Select an option', true, 7, '[{"label": "No (first time)", "value": "no"}, {"label": "Yes", "value": "yes"}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

UPDATE task_responses r
SET field_id = f.id
FROM task_form_fields f
JOIN tasks tk ON tk.task_template_id = f.task_template_id
WHERE r.field_id IS NULL
  AND r.task_id = tk.id
  AND lower(trim(r.field_label)) = lower(trim(f.label))
  AND f.id IN ('fd4d20c7-a432-481f-8266-0cca2a268bcc', '14b13a79-4577-4dda-bde4-8df3f68b32f1', 'a5ac0edd-f29c-41fd-bfae-e0b2d0e69ef5', 'd6e9f73f-15c8-4082-9755-45eb488d34ac', '4ffaa679-410b-49ce-b586-0910bf787047');

COMMIT;
