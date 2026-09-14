-- Moves the hold-title block (explainer, question, ILA notice, ownership shares)
-- out of Purchase "Personal Information" into its own shared task, so any party
-- on the file can answer it and every party sees the same answer.
--
-- Fields are moved, not copied, so their ids — and every saved answer — stay valid.
-- Existing multi-party purchase files get the new task with the family's answer
-- carried over. Originals are kept in hold_title_backup_* for the rollback script.
--
-- Templates are matched by name, not id, so this works on any environment.
-- Requires the matching app code (isHoldTitleTask routing) to be deployed first.
-- Safe to re-run: it does nothing once the question has left Personal Information.

BEGIN;

CREATE TABLE IF NOT EXISTS hold_title_backup_fields (LIKE task_form_fields);
CREATE TABLE IF NOT EXISTS hold_title_backup_responses (LIKE task_responses);

DO $$
DECLARE
  pi_tpl task_templates%ROWTYPE;
  ht_id  task_templates.id%TYPE;
  moved  text[] := ARRAY[
    'Understanding Joint Tenants vs Tenants in Common',
    'How would you like to hold title: joint vs tenants in common?',
    'Independent Legal Advice (ILA) notice',
    'Ownership shares'
  ];
BEGIN
  SELECT t.* INTO pi_tpl
  FROM task_templates t
  WHERE t.name ILIKE '%personal info%'
    AND lower(trim(t.lead_type)) = 'purchase'
    AND t.is_deleted = false
    AND EXISTS (
          SELECT 1 FROM task_form_fields f
          WHERE f.task_template_id = t.id AND f.label = moved[2])
  ORDER BY t.created_at
  LIMIT 1;

  IF pi_tpl.id IS NULL THEN
    RAISE NOTICE 'Hold-title question is not on Personal Information — nothing to move.';
    RETURN;
  END IF;

  -- ── Backups ──
  INSERT INTO hold_title_backup_fields
  SELECT f.* FROM task_form_fields f
  WHERE f.task_template_id = pi_tpl.id AND f.label = ANY (moved)
    AND NOT EXISTS (SELECT 1 FROM hold_title_backup_fields b WHERE b.id = f.id);

  INSERT INTO hold_title_backup_responses
  SELECT r.* FROM task_responses r
  WHERE r.field_id IN (SELECT id FROM hold_title_backup_fields)
    AND NOT EXISTS (SELECT 1 FROM hold_title_backup_responses b WHERE b.id = r.id);

  -- ── The new template, in the same stage just after Personal Information ──
  INSERT INTO task_templates
    (lead_type, role_type, name, order_index, deadline_rule, is_aps_task,
     is_deleted, is_default, stage_template_id, is_shared, activation_required)
  VALUES
    (pi_tpl.lead_type, pi_tpl.role_type, 'How Will You Hold Title?',
     pi_tpl.order_index + 1, pi_tpl.deadline_rule, false,
     false, true, pi_tpl.stage_template_id, true, false)
  RETURNING id INTO ht_id;

  UPDATE task_form_fields
  SET task_template_id = ht_id,
      order_index = array_position(moved, label)
  WHERE task_template_id = pi_tpl.id AND label = ANY (moved);

  -- ── A task on every multi-party purchase file, beside its Personal Information ──
  INSERT INTO tasks
    (deal_id, milestone_id, task_template_id, title, status, completed,
     role_type, is_shared, side, is_deleted, order_index, activation_required)
  SELECT DISTINCT ON (pt.deal_id)
         pt.deal_id, pt.milestone_id, ht_id, 'How Will You Hold Title?', 'Pending', false,
         pt.role_type, true, pt.side, false, pi_tpl.order_index + 1, false
  FROM tasks pt
  JOIN deals d ON d.id = pt.deal_id AND d.is_deleted = false
  JOIN leads l ON l.id = d.lead_id
  WHERE pt.is_deleted = false
    AND pt.side IS DISTINCT FROM 'sale'
    AND (pt.task_template_id = pi_tpl.id
         OR (pt.task_template_id IS NULL
             AND lower(trim(pt.title)) = lower(trim(pi_tpl.name))))
    AND (SELECT count(*) FROM leads fl
         WHERE fl.id = COALESCE(l.parent_lead_id, l.id)
            OR fl.parent_lead_id = COALESCE(l.parent_lead_id, l.id)) > 1
  ORDER BY pt.deal_id, pt.created_at;

  -- ── Carry each family's answer onto every party's new task ──
  -- Whoever answered is the source; the primary's copy wins if several did.
  WITH answered AS (
    SELECT r.task_id,
           COALESCE(l.parent_lead_id, l.id) AS family,
           (l.parent_lead_id IS NULL)       AS is_primary,
           r.updated_at
    FROM task_responses r
    JOIN task_form_fields f ON f.id = r.field_id
    JOIN tasks pt ON pt.id = r.task_id
    JOIN deals d ON d.id = pt.deal_id
    JOIN leads l ON l.id = d.lead_id
    WHERE f.task_template_id = ht_id
      AND f.label = moved[2]
      AND trim(COALESCE(r.value, '')) <> ''
      AND pt.task_template_id IS DISTINCT FROM ht_id
      AND pt.is_deleted = false
  ),
  source AS (
    SELECT DISTINCT ON (family) family, task_id
    FROM answered
    ORDER BY family, is_primary DESC, updated_at DESC NULLS LAST
  ),
  targets AS (
    SELECT ht.id AS task_id, COALESCE(l.parent_lead_id, l.id) AS family
    FROM tasks ht
    JOIN deals d ON d.id = ht.deal_id
    JOIN leads l ON l.id = d.lead_id
    WHERE ht.task_template_id = ht_id AND ht.is_deleted = false
  )
  INSERT INTO task_responses
    (task_id, field_id, field_label, field_type, value, file_url, file_name)
  SELECT t.task_id, r.field_id, r.field_label, r.field_type, r.value, r.file_url, r.file_name
  FROM targets t
  JOIN source s ON s.family = t.family
  JOIN task_responses r ON r.task_id = s.task_id
  JOIN task_form_fields f ON f.id = r.field_id AND f.task_template_id = ht_id;

  -- Complete: answered, with shares given whenever Tenants in Common was chosen.
  UPDATE tasks ht
  SET completed = true, status = 'Completed', completed_at = now()
  WHERE ht.task_template_id = ht_id
    AND ht.is_deleted = false
    AND EXISTS (
          SELECT 1
          FROM task_responses q
          JOIN task_form_fields qf ON qf.id = q.field_id
          WHERE q.task_id = ht.id
            AND qf.label = moved[2]
            AND trim(COALESCE(q.value, '')) <> ''
            AND (q.value <> 'Tenants in Common'
                 OR EXISTS (
                      SELECT 1
                      FROM task_responses s
                      JOIN task_form_fields sf ON sf.id = s.field_id
                      WHERE s.task_id = ht.id
                        AND sf.label = moved[4]
                        AND trim(COALESCE(s.value, '')) <> '')));

  -- ── Drop the old copies from Personal Information ──
  DELETE FROM task_responses r
  USING tasks pt
  WHERE pt.id = r.task_id
    AND pt.task_template_id IS DISTINCT FROM ht_id
    AND r.field_id IN (SELECT id FROM task_form_fields WHERE task_template_id = ht_id);
END $$;

COMMIT;

-- Verify: the four fields now sit on the new shared template.
SELECT t.name, t.is_shared, t.order_index AS template_order, f.order_index, f.field_type, f.label
FROM task_form_fields f
JOIN task_templates t ON t.id = f.task_template_id
WHERE t.name = 'How Will You Hold Title?' AND t.is_deleted = false
ORDER BY f.order_index;

-- Verify: new tasks created, and how many carried a completed answer.
SELECT count(*) AS hold_title_tasks,
       count(*) FILTER (WHERE completed) AS completed
FROM tasks
WHERE title = 'How Will You Hold Title?' AND is_deleted = false;
