-- Turns the hold-title explainer into a "?" badge popover next to the question
-- label, and adds the ILA text as a yellow disclaimer inside it.
-- Requires the PersonalInfoTaskDrawer.tsx badge support to be deployed.

BEGIN;

UPDATE task_form_fields
SET options = options || jsonb_build_object(
      'display', 'badge',
      'collapsible', false,
      'disclaimer', 'Please note if you go with this option, the parties with lower shares will need to obtain Independent Legal Advice (ILA) as they are taking full mortgage liability for lower shares. This needs to be obtained from another lawyer outside our firm and they will have their own fees. If you have questions about this, please contact us.'
    )
WHERE label = 'Understanding Joint Tenants vs Tenants in Common';

COMMIT;

-- Verify: display should read "badge" and disclaimer should be present.
SELECT t.name, t.lead_type, f.order_index, f.label,
       f.options -> 'display'    AS display,
       f.options -> 'attach_to'  AS attach_to,
       (f.options ? 'disclaimer') AS has_disclaimer
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE f.label = 'Understanding Joint Tenants vs Tenants in Common';
