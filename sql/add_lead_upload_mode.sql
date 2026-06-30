-- Records WHICH of the three post-retainer-sign "Who will be uploading your
-- documents?" answers the primary applicant picked. This is the explicit mode
-- behind leads.submit_on_behalf:
--   'me'   = the primary uploads everyone's documents (only the primary has a
--            portal account; co-persons have no dashboard).
--   'co'   = a chosen co-purchaser/co-seller uploads the primary's documents and
--            their own (that co-person is the designated uploader).
--   'both' = everyone has a dashboard and ANYONE can upload for ANYONE.
--   NULL   = not answered yet, or the lead has no co-persons (popup never showed).
--
-- submit_on_behalf alone cannot distinguish 'me' from 'both' (both leave the flag
-- on the PRIMARY), yet 'both' must let every party — not just the uploader — act
-- on the others' behalf. upload_mode is the source of truth the on-behalf-targets
-- and family-task-status routes branch on. See add_lead_submit_on_behalf.sql.
--
-- One decision per deal, stored on the PRIMARY lead row only
-- (parent_lead_id IS NULL). Co-person lead rows leave this NULL.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS upload_mode text NULL
    CHECK (upload_mode IS NULL OR upload_mode IN ('me', 'co', 'both'));

