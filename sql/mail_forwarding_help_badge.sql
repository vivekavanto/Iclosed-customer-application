-- A "?" badge beside the "Mail forwarding address" heading on Personal
-- Information, reading "Address where you'd like mail to be sent." — same
-- mechanism as the hold-title badge (a `note` field with display "badge",
-- attached to its target by label).
--
-- Both sides: Purchase and Sale.
--
-- `attach_to` here names the section heading rather than a field label, so the
-- app draws the badge next to the heading and never as a standalone callout.
-- Deploy the app code FIRST — older code renders it as a grey block instead.
--
-- Idempotent via the NOT EXISTS guard.

BEGIN;

INSERT INTO task_form_fields
  (task_template_id, field_type, label, placeholder, required, order_index, options)
SELECT t.id, 'note', 'Mail forwarding address', NULL, false, 2,
       '{"display":"badge","variant":"info",
         "attach_to":"Mail forwarding address",
         "text":"Address where you''d like mail to be sent."}'::jsonb
FROM task_templates t
WHERE t.name ILIKE '%personal information%'
  AND t.lead_type IN ('Purchase', 'Sale')
  AND t.is_deleted = false
  AND NOT EXISTS (
        SELECT 1 FROM task_form_fields x
        WHERE x.task_template_id = t.id
          AND x.field_type = 'note'
          AND x.label = 'Mail forwarding address'
      );

COMMIT;

-- Verify — one note row per live personal-information template:
-- SELECT t.name, t.lead_type, f.order_index, f.field_type, f.label, f.options
-- FROM task_form_fields f
-- JOIN task_templates t ON t.id = f.task_template_id
-- WHERE f.label = 'Mail forwarding address' AND t.is_deleted = false;
