-- CMP-002 — capture explicit privacy consent at intake.
--
-- The intake form now requires the client to tick a privacy-consent box before
-- submitting their personal information. We record WHICH policy version they
-- agreed to and WHEN, so consent is demonstrable (PIPEDA Consent principle) and
-- we can re-prompt if the policy materially changes.
--
-- Run this BEFORE deploying the consent UI so the columns exist when the intake
-- route writes them.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS privacy_consent_at        timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_consent_version   text;
