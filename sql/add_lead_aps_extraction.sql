-- Stores the RAW result of reading an uploaded Agreement of Purchase and Sale
-- (/api/intake/extract-aps → Gemini), alongside the values the client actually
-- accepted into the form.
--
-- Why keep both: everything the extractor produces is a suggestion the client
-- can edit or ignore, and what gets written to the lead's price / deposit /
-- address / closing_date columns is whatever was on screen at submit. Without
-- the raw read there is no way to tell later whether a discrepancy between the
-- file and the lead was a bad extraction or a deliberate client correction.
--
-- Shape (one key per side; either may be absent):
--   {
--     "purchase": { "extracted_at": "...", "file_name": "...", "result": { ... } },
--     "sale":     { "extracted_at": "...", "file_name": "...", "result": { ... } }
--   }
-- where "result" is the normalized ApsExtractionResult from src/lib/apsExtraction.ts.
--
-- NULL means no APS was uploaded, extraction was off, or the read failed —
-- all of which are ordinary outcomes, not errors.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS aps_extraction JSONB NULL;

-- Verify:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'leads' AND column_name = 'aps_extraction';
