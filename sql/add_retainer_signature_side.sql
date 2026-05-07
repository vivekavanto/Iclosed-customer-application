-- Tags each retainer signature with its 'side' (purchase or sale) so a
-- "Purchase & Sale" lead can collect TWO separate signed retainers — one
-- for the purchase property and one for the sale property — each with its
-- own PDF stored in lead_corporate_docs. NULL for single-side leads
-- (Purchase, Sale, Refinance, Condo); their behaviour is unchanged.
--
-- The unique index ensures a lead can have at most one signature per side,
-- and at most one side-less signature, so non-P&S leads keep their existing
-- one-row-per-lead invariant via COALESCE(side, '').
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE retainer_signatures
  ADD COLUMN IF NOT EXISTS side text NULL
    CHECK (side IN ('purchase', 'sale') OR side IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS retainer_signatures_lead_side_uniq
  ON retainer_signatures (lead_id, COALESCE(side, ''));
