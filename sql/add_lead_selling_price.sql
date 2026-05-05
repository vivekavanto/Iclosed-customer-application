-- Adds a separate price column for the selling property, so Buy & Sell intakes
-- (sub_service = 'both') can capture purchase price AND sale price independently.
-- The existing `price` column continues to hold the purchase / single-side price.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS selling_price NUMERIC NULL;
