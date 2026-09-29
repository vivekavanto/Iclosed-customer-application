-- Optional legal-fee discount shown on the retainer; NULL hides it.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NULL;
