-- Audit trail for the post-retainer-sign delegation consent:
-- "By selecting this option, you are giving your co-purchaser(s) permission to
--  upload documents and personal information on your behalf."
--
-- When a PRIMARY applicant picks "My co-purchaser" and clicks "I agree", we
-- record proof of that permission grant on the PRIMARY lead row:
--   upload_consent_at               = when the primary agreed (UTC)
--   upload_consent_uploader_lead_id = the co-person they granted upload rights to
--
-- When the primary picks "Me" (no delegation, no consent popup), both columns are
-- cleared to NULL. They also stay NULL for co-person rows and for leads with no
-- co-persons (popup never shown). The resulting uploader assignment itself lives
-- in leads.submit_on_behalf (see add_lead_submit_on_behalf.sql).
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS upload_consent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS upload_consent_uploader_lead_id uuid NULL
    REFERENCES leads(id) ON DELETE SET NULL;
