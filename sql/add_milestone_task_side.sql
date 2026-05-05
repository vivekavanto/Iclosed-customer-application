-- Tags each milestone and task with its 'side' (purchase or sale) so the
-- customer dashboard can render Purchase & Sale deals as two parallel
-- timelines — one per side. NULL for single-side deals (Purchase, Sale,
-- Refinance, Condo); behaviour for those is unchanged.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS side text NULL
    CHECK (side IN ('purchase', 'sale') OR side IS NULL);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS side text NULL
    CHECK (side IN ('purchase', 'sale') OR side IS NULL);

CREATE INDEX IF NOT EXISTS idx_milestones_deal_side ON milestones (deal_id, side);
CREATE INDEX IF NOT EXISTS idx_tasks_deal_side      ON tasks      (deal_id, side);
