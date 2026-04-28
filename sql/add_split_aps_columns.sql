-- Splits the single APS-signed/uploaded flags into per-side flags so the
-- Buy & Sell intake flow can capture purchase APS and sale APS independently.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS aps_signed_purchase boolean,
  ADD COLUMN IF NOT EXISTS aps_signed_sale boolean,
  ADD COLUMN IF NOT EXISTS aps_uploaded_purchase boolean,
  ADD COLUMN IF NOT EXISTS aps_uploaded_sale boolean;

-- Backfill: existing rows used aps_signed/aps_uploaded as a single flag.
-- Map each row onto the side that matches its sub_service. Buy & Sell rows
-- predate the split, so leave the per-side flags NULL for review.
UPDATE leads
SET aps_signed_purchase = aps_signed
WHERE sub_service = 'buying' AND aps_signed_purchase IS NULL;

UPDATE leads
SET aps_signed_sale = aps_signed
WHERE sub_service = 'selling' AND aps_signed_sale IS NULL;

UPDATE leads
SET aps_uploaded_purchase = aps_uploaded
WHERE sub_service = 'buying' AND aps_uploaded_purchase IS NULL;

UPDATE leads
SET aps_uploaded_sale = aps_uploaded
WHERE sub_service = 'selling' AND aps_uploaded_sale IS NULL;
