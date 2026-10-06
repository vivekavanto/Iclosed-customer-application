-- Virtual signing notice back on Virtually, without the fee. Idempotent.
UPDATE task_form_fields f
SET visible_when = NULL,
    options = f.options || jsonb_build_object(
      'text', 'Please note: If you choose virtual signing, we''ll verify your identity through Treefort, a secure online ID verification service.',
      'visible_when', jsonb_build_object(
        'field_label', 'Would you like to sign the documents in person or virtually?',
        'equals', 'virtually'))
FROM task_templates t
WHERE f.task_template_id = t.id
  AND t.name ILIKE '%personal information%'
  AND t.lead_type IN ('Purchase', 'Sale')
  AND t.is_deleted = false
  AND f.label = 'Virtual signing fee notice';
