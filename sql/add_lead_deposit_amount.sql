-- Adds the optional deposit captured on the intake form (Step 2 → Property
-- Details). `deposit_amount` holds the deposit for the purchase / single-side
-- property; `selling_deposit_amount` holds it for the sale property on Buy &
-- Sell intakes (sub_service = 'both'). Both are optional — NULL means the
-- client did not provide a deposit at intake time.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS selling_deposit_amount NUMERIC NULL;
