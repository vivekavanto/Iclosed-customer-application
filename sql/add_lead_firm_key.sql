-- Which of the two law firms a file belongs to: Nava Wilson PC or iClosed LLP.
--
-- THIS IS THE MISSING PIECE. Both apps already ship the firm feature in full —
-- src/lib/firms.ts (mirrored in the admin repo), leadFirm.ts, firmEmail.ts, the
-- per-firm retainer wording and PDF lockup — but every one of them reads
-- `leads.firm_key`, and the column was never created. The lookup in
-- getLeadFirmKey() therefore fails with 42703 (`column leads.firm_key does not
-- exist`), returns no row, and falls back to DEFAULT_FIRM_KEY.
--
-- The visible symptoms of that one missing column:
--   • The admin panel cannot separate clients by firm — there is no per-file
--     value to group or filter on; every file is the default.
--   • EVERY retainer names the default firm's legal entity, whoever the file
--     actually belongs to.
--   • All outbound mail leaves from the default firm's address. While the
--     default was 'navawilson' that address was iclosed@navawilson.law, an
--     UNVERIFIED sending domain in Resend, so Resend answered 403 and no
--     client-facing email was delivered at all.
--
-- The ROOT lead of a family is authoritative: getLeadFirmKey() follows
-- parent_lead_id up to the primary and reads the value there, so co-purchasers
-- and co-sellers inherit the primary's firm and one transaction can never be
-- half Nava Wilson and half iClosed. Co-person rows may carry their own copy
-- (the admin app keeps it in step) as a fallback for an orphaned child.
--
-- NULL is valid and means "not labelled yet" — those rows resolve to
-- DEFAULT_FIRM_KEY in code. Backfill below; keep the keys in step with the
-- FirmKey union in both repos' firms.ts.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS firm_key text NULL
    CHECK (firm_key IS NULL OR firm_key IN ('navawilson', 'iclosed'));

-- The admin panel filters and groups files by firm, so this column is read on
-- every list view. Partial: NULL rows are the unlabelled default and are never
-- the thing being filtered FOR.
CREATE INDEX IF NOT EXISTS leads_firm_key_idx
  ON leads (firm_key)
  WHERE firm_key IS NOT NULL;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every existing file predates the column and is therefore unlabelled. Decide
-- deliberately which firm they belong to, then run ONE of the following.
-- Leaving them NULL is also valid: they resolve to DEFAULT_FIRM_KEY in code.
--
-- (a) All existing files are Nava Wilson (they were, before firms existed):
--
--   UPDATE leads SET firm_key = 'navawilson' WHERE firm_key IS NULL;
--
-- (b) All existing files are iClosed LLP:
--
--   UPDATE leads SET firm_key = 'iclosed' WHERE firm_key IS NULL;
--
-- Then keep co-persons in step with their primary — the root is authoritative,
-- but a child that outlives its parent falls back to its own copy:
--
--   UPDATE leads AS child
--   SET firm_key = parent.firm_key
--   FROM leads AS parent
--   WHERE child.parent_lead_id = parent.id
--     AND child.firm_key IS DISTINCT FROM parent.firm_key;

-- ── Verification ────────────────────────────────────────────────────────────
-- Expect the column to exist and the split to match what you intended.
SELECT COALESCE(firm_key, '(unlabelled → default)') AS firm, COUNT(*)
FROM leads
GROUP BY 1
ORDER BY 2 DESC;
