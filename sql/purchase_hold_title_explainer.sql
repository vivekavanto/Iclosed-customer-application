-- Hold-title explainer: redesign wording, collapsed card. Idempotent.

UPDATE task_form_fields f
SET options = jsonb_build_object(
  'variant', 'info',
  'collapsible', true,
  'sections', jsonb_build_array(
    jsonb_build_object('heading', 'A) Joint Tenants', 'items', jsonb_build_array(
      jsonb_build_object('term', '1. Right of Survivorship', 'body', 'Upon the death of one joint tenant, their interest in the property automatically passes to the surviving joint tenants. The property does not go through probate and is not inherited by the deceased tenant''s heirs.'),
      jsonb_build_object('term', '2. Equal Ownership', 'body', 'Each joint tenant has an equal share in the property, regardless of how much each contributed to the purchase price.'),
      jsonb_build_object('term', '3. Unity of Time, Title, Interest, and Possession', 'body', 'All joint tenants acquire their interest at the same time, through the same transaction, with an equal interest and an equal right to possess the whole property.'))),
    jsonb_build_object('heading', 'B) Tenants in Common', 'items', jsonb_build_array(
      jsonb_build_object('term', '1. No Right of Survivorship', 'body', 'When a tenant in common dies, their share passes according to their will or the laws of intestacy, rather than to the other co-owners.'),
      jsonb_build_object('term', '2. Unequal Shares', 'body', 'Tenants in common can own unequal shares, for example 60% and 40%.'),
      jsonb_build_object('term', '3. Separate Interests', 'body', 'Each holds an individual, undivided interest. Regardless of shares, all owners are equally liable for the mortgage.')))))
FROM task_templates t
WHERE t.id = f.task_template_id
  AND t.name = 'Ownership shares' AND t.lead_type = 'Purchase' AND t.is_deleted = false
  AND f.field_type = 'note' AND f.label = 'Understanding Joint Tenants vs Tenants in Common';
