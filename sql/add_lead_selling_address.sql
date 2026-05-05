-- Adds selling-side address columns so Buy & Sell intakes (sub_service = 'both')
-- can capture purchase address AND sale address independently. The existing
-- address_* columns continue to hold the purchase / single-side address.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS selling_address_street      text,
  ADD COLUMN IF NOT EXISTS selling_address_unit        text,
  ADD COLUMN IF NOT EXISTS selling_address_city        text,
  ADD COLUMN IF NOT EXISTS selling_address_postal_code text,
  ADD COLUMN IF NOT EXISTS selling_address_province    text;
