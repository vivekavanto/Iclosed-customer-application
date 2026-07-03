-- Replaces the old leads.submit_on_behalf boolean with explicit document-upload
-- choice fields.
--
-- Source of truth after this migration:
--   leads.upload_mode:
--     'me'   = primary uploads documents
--     'co'   = selected co-purchaser/co-seller uploads documents
--     'both' = each party uploads their own documents
--   leads.upload_consent_uploader_lead_id:
--     selected co-person lead id when upload_mode = 'co'
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS upload_mode text NULL
    CHECK (upload_mode IS NULL OR upload_mode IN ('me', 'co', 'both')),
  ADD COLUMN IF NOT EXISTS upload_consent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS upload_consent_uploader_lead_id uuid NULL
    REFERENCES leads(id) ON DELETE SET NULL;

-- Best-effort backfill from the legacy boolean before dropping it:
-- true on a co-person means that co-person was the uploader.
WITH family AS (
  SELECT
    primary_lead.id AS primary_id,
    uploader.id AS uploader_id,
    uploader.parent_lead_id IS NOT NULL AS uploader_is_co_person
  FROM leads primary_lead
  JOIN leads uploader
    ON uploader.id = primary_lead.id
    OR uploader.parent_lead_id = primary_lead.id
  WHERE primary_lead.parent_lead_id IS NULL
    AND uploader.submit_on_behalf IS TRUE
)
UPDATE leads primary_lead
SET
  upload_mode = CASE
    WHEN family.uploader_is_co_person THEN 'co'
    ELSE COALESCE(primary_lead.upload_mode, 'me')
  END,
  upload_consent_uploader_lead_id = CASE
    WHEN family.uploader_is_co_person THEN family.uploader_id
    ELSE NULL
  END
FROM family
WHERE primary_lead.id = family.primary_id
  AND primary_lead.upload_mode IS NULL;

ALTER TABLE leads
  DROP COLUMN IF EXISTS submit_on_behalf;
