-- Prod: intake property type columns only, no Status Certificate task. Idempotent.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS building_type text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS building_type text;
