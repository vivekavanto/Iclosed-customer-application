-- Enable multiple-file upload on the APS (Agreement of Purchase and Sale)
-- form field, so customers can attach the agreement plus its amendments and
-- waivers in the portal's DynamicTaskDrawer.
--
-- The drawer reads options.multiple per field (getFileConfig). This flips it
-- on ONLY for the APS file field(s) — every other file field (identification,
-- home insurance, etc.) stays single-file. Idempotent.
--
-- The APS field is identified as a file field whose options.doc_type = 'aps'
-- (it uploads docs as doc_type "aps"); we also match by label as a fallback
-- in case doc_type was never set on the options.

UPDATE task_form_fields
SET options = COALESCE(options, '{}'::jsonb) || '{"multiple": true}'::jsonb
WHERE field_type = 'file'
  AND (
    options->>'doc_type' = 'aps'
    OR label ILIKE '%agreement of purchase%'
  );

-- Verify:
-- SELECT id, label, field_type, options
-- FROM task_form_fields
-- WHERE field_type = 'file' AND options->>'multiple' = 'true';
