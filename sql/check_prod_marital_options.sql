-- Read-only. If Purchase still lists separated_formal / separated_no_formal,
-- purchase_marital_status_single_separated has not been applied.

SELECT t.name, t.lead_type, f.label, jsonb_pretty(f.options) AS options
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE f.label ILIKE '%marital%' AND t.is_deleted = false
ORDER BY t.lead_type;
