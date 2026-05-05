-- Mirrors the existing purchase columns (price + property_address) on the deals
-- table so Buy & Sell deals (type = 'Purchase & Sale') can carry a sale-side
-- price and a sale-side address shorthand. The full sale address breakdown
-- lives on the leads table (selling_address_*) — deals only need the shorthand,
-- matching how the purchase side already works.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS selling_price            numeric(12, 2) NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selling_property_address text NULL;
