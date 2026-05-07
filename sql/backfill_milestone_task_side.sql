-- Backfill the `side` column on milestones and tasks for "Purchase & Sale"
-- deals that were converted BEFORE the per-side flow shipped (commit 515fc90).
--
-- Those legacy rows have side = NULL, which causes the dashboard side filter
-- at src/app/(dashboard)/dashboard/page.tsx to drop everything for P&S deals.
--
-- Strategy: derive the correct side from the row's template lead_type —
--   stage_templates.lead_type = 'Purchase' → side = 'purchase'
--   stage_templates.lead_type = 'Sale'     → side = 'sale'
-- Same mapping for task_templates via task_template_id.
--
-- Scope: only rows where deal.type = 'Purchase & Sale' AND side IS NULL.
-- Single-side deals (Purchase / Sale / Refinance / Condo) keep side = NULL —
-- that's correct and the dashboard filter ignores them.
--
-- Rows whose template_id is NULL or whose template.lead_type is something
-- other than Purchase/Sale (e.g. Refinance) are left untouched. Admins can
-- fix those manually if any show up.
--
-- Apply once in the Supabase SQL editor.

-- ── 1. Preview what will change (run this first to sanity-check) ──
-- SELECT
--   m.id,
--   m.deal_id,
--   m.title,
--   m.side AS current_side,
--   CASE st.lead_type
--     WHEN 'Purchase' THEN 'purchase'
--     WHEN 'Sale'     THEN 'sale'
--   END AS new_side,
--   st.lead_type AS template_lead_type
-- FROM milestones m
-- JOIN stage_templates st ON st.id = m.stage_template_id
-- JOIN deals d            ON d.id  = m.deal_id
-- WHERE d.type = 'Purchase & Sale'
--   AND m.side IS NULL
--   AND st.lead_type IN ('Purchase', 'Sale');

-- ── 2. Backfill milestones ──
UPDATE milestones AS m
SET side = CASE st.lead_type
  WHEN 'Purchase' THEN 'purchase'
  WHEN 'Sale'     THEN 'sale'
END
FROM stage_templates AS st,
     deals AS d
WHERE m.stage_template_id = st.id
  AND m.deal_id           = d.id
  AND d.type              = 'Purchase & Sale'
  AND m.side IS NULL
  AND st.lead_type IN ('Purchase', 'Sale');

-- ── 3. Backfill tasks ──
UPDATE tasks AS t
SET side = CASE tt.lead_type
  WHEN 'Purchase' THEN 'purchase'
  WHEN 'Sale'     THEN 'sale'
END
FROM task_templates AS tt,
     deals AS d
WHERE t.task_template_id = tt.id
  AND t.deal_id          = d.id
  AND d.type             = 'Purchase & Sale'
  AND t.side IS NULL
  AND tt.lead_type IN ('Purchase', 'Sale');

-- ── 4. Verify the result ──
-- After running, this should show side ∈ {purchase, sale} for P&S deal rows.
-- Any leftover NULLs are rows whose template_id is NULL or whose template
-- lead_type isn't Purchase/Sale — review those manually.
--
-- SELECT 'milestones' AS table_name, side, COUNT(*) AS n
-- FROM milestones
-- WHERE deal_id IN (SELECT id FROM deals WHERE type = 'Purchase & Sale')
-- GROUP BY side
-- UNION ALL
-- SELECT 'tasks', side, COUNT(*)
-- FROM tasks
-- WHERE deal_id IN (SELECT id FROM deals WHERE type = 'Purchase & Sale')
-- GROUP BY side;
