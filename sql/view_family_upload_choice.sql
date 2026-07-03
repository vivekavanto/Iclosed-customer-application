-- View exposing resolved family upload choice for easy queries.
-- Shows the primary lead id, configured upload_mode and the resolved uploader lead id
-- (NULL when upload_mode = 'both').

CREATE OR REPLACE VIEW family_upload_choice AS
SELECT
  primary_lead.id AS primary_lead_id,
  primary_lead.upload_mode,
  primary_lead.upload_consent_uploader_lead_id,
  CASE
    WHEN primary_lead.upload_mode = 'both' THEN NULL
    WHEN primary_lead.upload_mode = 'co' THEN primary_lead.upload_consent_uploader_lead_id
    ELSE primary_lead.id
  END AS resolved_uploader_lead_id
FROM leads primary_lead
WHERE primary_lead.parent_lead_id IS NULL;
