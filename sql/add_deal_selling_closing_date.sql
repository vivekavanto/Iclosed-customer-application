-- Adds the sale-side closing date to deals, mirroring how selling_price and
-- selling_property_address already mirror their purchase-side counterparts.
--
-- Why: a Buy & Sell intake now captures TWO closing dates (leads.closing_date
-- and leads.selling_closing_date — see add_lead_closing_date.sql). Without this
-- column, convertLead() can only carry the purchase-side date onto the deal and
-- the sale-side date the client gave is stranded on the lead, invisible to the
-- admin panel.
--
-- Nullable, and only ever set for type = 'Purchase & Sale' deals.
--
-- convertLead() spreads this key conditionally, so conversion keeps working
-- whether or not this migration has been applied yet.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS selling_closing_date DATE NULL;

-- Verify:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'deals' AND column_name = 'selling_closing_date';
