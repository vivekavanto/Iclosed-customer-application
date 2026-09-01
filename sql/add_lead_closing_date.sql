-- Adds the closing (completion) date captured on the intake form
-- (Step 3 → Property Details). `closing_date` holds the date for the purchase /
-- single-side property; `selling_closing_date` holds it for the sale property
-- on Buy & Sell intakes (sub_service = 'both').
--
-- Why intake collects this now: the closing date is one of the elements printed
-- on the Agreement of Purchase and Sale, so it is both askable up front and
-- readable off an uploaded APS. Until now it existed only on `deals`, typed by
-- an admin at conversion time (convertLead → deals.closing_date), which meant a
-- date the client already knew had to be re-keyed by staff.
--
-- Both are OPTIONAL — NULL means the client did not provide one at intake time,
-- which is normal for anyone who has not signed an agreement yet.
--
-- convertLead() can fall back to these when the admin leaves the conversion
-- dialog's date blank; the deal remains the source of truth once created.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS closing_date DATE NULL,
  ADD COLUMN IF NOT EXISTS selling_closing_date DATE NULL;

-- Verify:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'leads'
--   AND column_name IN ('closing_date', 'selling_closing_date');
