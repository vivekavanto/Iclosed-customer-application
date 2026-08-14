-- Every estimate produced by the PUBLIC closing-cost calculator
-- (/closing-cost-calculator), recorded when the visitor takes the estimate away
-- with them — either by downloading the PDF or by having it emailed.
--
-- Why a table of its own rather than a row in `leads`:
-- a calculator visitor has signed nothing, uploaded nothing and asked for
-- nothing. `leads` is the intake pipeline that convertLead.ts turns into deals
-- and that the admin panel's lead views read; dropping browsers into it would
-- make every count and queue there wrong.
--
-- What you can and cannot expect from a row:
--   source = 'email'  →  the visitor typed an address, so this is a person the
--                        firm can actually contact.
--   source = 'pdf'    →  `email` is almost always NULL. A browser does not
--                        identify itself and the name/email inputs live inside
--                        the "Email it to me" panel, which a downloader never
--                        opens. These rows are a DEMAND signal — how many people
--                        are pricing an $850k Toronto purchase this week — not a
--                        callable lead.
--
-- Writes come only from the service-role client in src/lib/recordPublicEstimate.ts.
--
-- Apply once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS calculator_estimates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              timestamptz NOT NULL DEFAULT now(),

  -- 'pdf' = downloaded it, 'email' = had it emailed. The only two ways in.
  source                  text NOT NULL CHECK (source IN ('pdf','email')),

  -- Contact, when there is any. See the note above about 'pdf' rows.
  client_name             text NULL,
  email                   text NULL,

  -- What the visitor typed.
  purchase_price          numeric(14,2) NOT NULL,
  deposit_paid            numeric(14,2) NOT NULL DEFAULT 0,
  mortgage_amount         numeric(14,2) NOT NULL DEFAULT 0,
  is_toronto              boolean NOT NULL DEFAULT false,
  is_first_time_buyer     boolean NOT NULL DEFAULT false,

  -- What the server computed, so a row reads on its own without re-running the
  -- calculator against today's rate card (which may since have changed).
  total_closing_costs     numeric(14,2) NULL,
  balance_due             numeric(14,2) NULL,
  property_tax_adjustment numeric(14,2) NULL,
  breakdown               jsonb NULL,          -- statement.detail: LTT, rebates, title, fees
  calc_version            integer NULL,        -- closingCosts.ts CALC_VERSION
  firm_key                text NULL,           -- whose rate card produced these figures

  -- Email path only; NULL on a 'pdf' row.
  email_sent              boolean NULL,        -- false when Resend rejected the send
  pdf_attached            boolean NULL,        -- false when the PDF failed to build

  -- Request context, for deduping repeat runs by the same visitor and for
  -- reviewing abuse of an unauthenticated endpoint.
  ip                      text NULL,
  user_agent              text NULL,
  referer                 text NULL
);

CREATE INDEX IF NOT EXISTS calculator_estimates_created_at_idx
  ON calculator_estimates (created_at DESC);

-- Partial and lowercased: the only lookup that matters is "has this person
-- estimated before", and the index skips the anonymous majority.
CREATE INDEX IF NOT EXISTS calculator_estimates_email_idx
  ON calculator_estimates (lower(email)) WHERE email IS NOT NULL;

-- RLS on with NO policies, so anon and authenticated get nothing. This table
-- holds strangers' financial figures and email addresses, and the default must
-- be that nobody reads it.
ALTER TABLE calculator_estimates ENABLE ROW LEVEL SECURITY;

-- The GRANT is NOT optional, and RLS is not a substitute for it.
--
-- service_role bypasses ROW-level security, but that says nothing about TABLE
-- privileges: without this grant every insert fails with 42501 "permission
-- denied for table calculator_estimates". Because recordPublicEstimate()
-- swallows its errors so a visitor still gets their PDF, that failure is silent
-- — the calculator works perfectly and the table simply stays empty.
--
-- This is the same trap check_rate_limit() fell into (see src/lib/rateLimit.ts):
-- it shipped without a service_role grant and every rate limit in both apps was
-- a silent no-op until a permissions migration fixed it. Re-running these two
-- lines on a table that already has the grant is harmless.
GRANT INSERT, SELECT ON calculator_estimates TO service_role;
