-- Records whether a co-person lead (parent_lead_id IS NOT NULL) was added
-- in the intake form as a co-PURCHASER or co-SELLER.
--
-- Before this column, both stacks of co-persons from the intake form were
-- flattened into one untyped list, so the admin panel could not tell a
-- co-purchaser apart from a co-seller for "Purchase & Sale" leads and ended
-- up labelling everyone as co-seller. The column is NULL for primary leads
-- (parent_lead_id IS NULL) and for legacy co-person rows that pre-date this
-- migration; only populate it for newly-created co-person leads from the
-- intake API.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS co_person_role text NULL
    CHECK (co_person_role IN ('purchaser', 'seller') OR co_person_role IS NULL);
