-- Restores the divorce upload rule: separated/divorced and primary residence. Idempotent.
UPDATE task_form_fields f
SET options = f.options || jsonb_build_object('visible_when', jsonb_build_object('all', jsonb_build_array(
      jsonb_build_object('field_label', 'Marital Status',
        'equals_any', jsonb_build_array('divorced', 'separated', 'separated_formal', 'separated_no_formal')),
      jsonb_build_object('field_label', CASE t.lead_type
          WHEN 'Purchase' THEN 'Is this purchase property your primary residence or an investment property?'
          ELSE 'Is the property being sold your primary residence or an investment property?' END,
        'equals_any', jsonb_build_array('primary', 'unsure')))))
FROM task_templates t
WHERE f.task_template_id = t.id
  AND t.is_deleted = false
  AND t.lead_type IN ('Purchase', 'Sale')
  AND t.name ILIKE '%personal information%'
  AND f.label = 'Separation Agreement or Divorce Certificate';
