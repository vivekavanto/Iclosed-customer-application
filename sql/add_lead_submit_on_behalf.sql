-- Records the primary applicant's answer to the post-retainer-sign popup:
-- "Want to help with your co-purchaser(s) paperwork?"
--   true  = "Yes, I'll upload on their behalf"  -> primary gets an auth view
--            to submit ID + personal info for their co-purchaser(s)/co-seller(s)
--   false = "No, they will upload themselves"
--   NULL  = not answered yet (primary hasn't signed / hasn't chosen, or
--           the lead has no co-persons so the popup never showed)
--
-- One decision per deal, stored on the PRIMARY lead row only
-- (parent_lead_id IS NULL). Co-person lead rows leave this NULL.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS submit_on_behalf boolean NULL;
