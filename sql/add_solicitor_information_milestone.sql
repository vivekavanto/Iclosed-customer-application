-- Purchase "Solicitor Information" milestone for the Solicitor Information task. Run after add_solicitor_information_task.sql. Idempotent.

DO $$
DECLARE
  task_tpl  task_templates%ROWTYPE;
  anchor    stage_templates%ROWTYPE;
  stage_id  stage_templates.id%TYPE;
  stage_ord integer;
  descr     constant jsonb := jsonb_build_object(
    'short', 'Our firm''s contact details, which you''ll need to forward to your mortgage broker or lender so they can send your mortgage instructions to the right place in time for closing.',
    'modal', 'Our firm''s contact details, which you''ll need to forward to your mortgage broker or lender so they can send your mortgage instructions to the right place in time for closing.');
BEGIN
  SELECT * INTO task_tpl
  FROM task_templates
  WHERE name = 'Solicitor Information' AND lead_type = 'Purchase' AND is_deleted = false
  LIMIT 1;
  IF task_tpl.id IS NULL THEN
    RAISE EXCEPTION 'Run add_solicitor_information_task.sql first.';
  END IF;

  SELECT id, order_index INTO stage_id, stage_ord
  FROM stage_templates
  WHERE name = 'Solicitor Information' AND lead_type = 'Purchase' AND is_deleted = false
  LIMIT 1;

  IF stage_id IS NULL THEN
    -- Directly after the stage Mortgage Representative Details belongs to.
    SELECT s.* INTO anchor
    FROM stage_templates s
    JOIN task_templates t ON t.stage_template_id = s.id
    WHERE t.name ILIKE '%mortgage representative%'
      AND t.lead_type = 'Purchase' AND t.is_deleted = false
    LIMIT 1;
    IF anchor.id IS NULL THEN
      RAISE EXCEPTION 'Stage for Mortgage Representative Details not found.';
    END IF;

    -- Existing files' milestones are snapshots, so they shift with their stages.
    UPDATE milestones
    SET order_index = order_index + 1
    WHERE stage_template_id IN (
      SELECT id FROM stage_templates
      WHERE lead_type = 'Purchase' AND is_deleted = false AND order_index > anchor.order_index);

    UPDATE stage_templates
    SET order_index = order_index + 1
    WHERE lead_type = 'Purchase' AND is_deleted = false AND order_index > anchor.order_index;

    stage_ord := anchor.order_index + 1;
    INSERT INTO stage_templates
      (lead_type, order_index, name, role, is_shared, email_template_id, description, auto_complete, is_deleted)
    VALUES
      ('Purchase', stage_ord, 'Solicitor Information', anchor.role, anchor.is_shared, NULL, descr, false, false)
    RETURNING id INTO stage_id;
  END IF;

  UPDATE task_templates SET stage_template_id = stage_id WHERE id = task_tpl.id;

  -- Existing Purchase files get the milestone now, so /api/milestones doesn't add it as "In Progress".
  -- Files already past it (a later milestone Completed) get it Completed.
  INSERT INTO milestones
    (deal_id, title, status, order_index, email_template_id, stage_template_id, description, completed_at, side)
  -- One per deal (unique on deal_id + stage); a tagged 'purchase' side wins over a legacy null.
  SELECT DISTINCT ON (m.deal_id)
         m.deal_id, 'Solicitor Information',
         CASE WHEN later.done THEN 'Completed' ELSE 'Pending' END,
         stage_ord, NULL, stage_id, descr,
         CASE WHEN later.done THEN now() ELSE NULL END,
         m.side
  FROM milestones m
  JOIN stage_templates s ON s.id = m.stage_template_id AND s.lead_type = 'Purchase'
  CROSS JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM milestones x
      WHERE x.deal_id = m.deal_id
        AND x.side IS NOT DISTINCT FROM m.side
        AND x.is_deleted = false
        AND x.order_index > stage_ord
        AND x.status = 'Completed') AS done
  ) later
  WHERE m.is_deleted = false
    AND NOT EXISTS (
      SELECT 1 FROM milestones e
      WHERE e.deal_id = m.deal_id
        AND e.stage_template_id = stage_id)
  ORDER BY m.deal_id, (m.side IS NULL);

  -- Tasks already created move under the new milestone.
  UPDATE tasks t
  SET milestone_id = m.id
  FROM milestones m
  WHERE t.task_template_id = task_tpl.id
    AND t.is_deleted = false
    AND m.deal_id = t.deal_id
    AND m.stage_template_id = stage_id
    AND t.milestone_id IS DISTINCT FROM m.id;
END $$;

SELECT s.order_index, s.name, s.description ->> 'short' AS description
FROM stage_templates s
WHERE s.lead_type = 'Purchase' AND s.is_deleted = false
ORDER BY s.order_index;
