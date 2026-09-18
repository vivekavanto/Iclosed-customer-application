-- Every article on the public blog (/blogs) and on the client dashboard's Blog
-- tab. One row is one article, at every stage of its life: a half-written
-- draft, a finished post waiting on a lawyer's sign-off, and the published
-- piece Google indexes are all rows here, separated only by `status`.
--
-- Why this table exists at all:
-- the three live posts used to be a hardcoded TypeScript array in
-- src/app/blogs/blogData.ts, with each article body as a raw HTML string —
-- duplicated again, with different dates, in the two dashboard blog pages.
-- Publishing meant a developer editing code and redeploying the site, and the
-- three copies had already drifted apart. This table is the single source both
-- surfaces now read.
--
-- On the SEO columns: they exist because nothing else on the site carries them.
-- `meta_title` and `meta_description` are what Google prints in the result —
-- distinct from `title`/`excerpt`, which are what a human reads on the page,
-- and both are allowed to be NULL so a post that never got hand-tuned still
-- renders sensible tags by falling back to the human-facing pair.
--
-- On `faq`: [{question, answer}]. This is the AEO payload — the Q&A that gets
-- lifted into a Google AI Overview or a ChatGPT answer. It is emitted as
-- FAQPage JSON-LD, and the page MUST also render it visibly; structured data
-- describing content a visitor cannot see is a manual-action-grade violation.
--
-- On `seo_source`: Gemini drafts blog markup and SEO copy, but this is Ontario
-- real-estate law content that answer engines quote verbatim. Nothing here is
-- ever auto-published. This column is how you audit, later and at a glance,
-- which published rows still carry unreviewed machine output.
--
-- Writes come only from the service-role client, via src/lib/blogPosts.ts.
--
-- Apply once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS blog_posts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- ── Routing ────────────────────────────────────────────────
  -- `slug` is the public URL: /blogs/<slug>. Changing it on a published post
  -- breaks every inbound link and every ranking that URL has earned.
  slug              text NOT NULL,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','scheduled','published')),
  -- The date shown to readers and sorted on. NULL until first publish.
  published_at      timestamptz NULL,

  -- ── Body ───────────────────────────────────────────────────
  title             text NOT NULL,
  excerpt           text NULL,
  -- Always SANITIZED before it lands here (src/lib/sanitizeBlogHtml.ts). It is
  -- sanitized again on read, because the three migrated rows predate the
  -- sanitizer and the admin app can write to this table without passing
  -- through our route handlers.
  content_html      text NULL,
  -- What the author actually typed, before Gemini added the markup. Kept so a
  -- re-format starts from the writer's words rather than from the model's
  -- previous output, which would compound any drift.
  content_source    text NULL,
  reading_time_min  integer NULL,

  -- ── Presentation ───────────────────────────────────────────
  -- Must be a PUBLIC URL. Cover images uploaded into the private blob store
  -- render as a broken image on a public page and are unfetchable by Googlebot.
  cover_image_url   text NULL,
  cover_image_alt   text NULL,
  author            text NOT NULL DEFAULT 'iClosed Real Estate Law Desk',
  tags              text[] NOT NULL DEFAULT '{}',

  -- ── SEO / AEO ──────────────────────────────────────────────
  meta_title        text NULL,          -- <= 60 chars; falls back to title
  meta_description  text NULL,          -- <= 155 chars; falls back to excerpt
  canonical_url     text NULL,          -- set only when the piece is syndicated
  og_image_url      text NULL,          -- falls back to cover_image_url
  focus_keyword     text NULL,
  faq               jsonb NOT NULL DEFAULT '[]'::jsonb,
  noindex           boolean NOT NULL DEFAULT false,

  -- ── Provenance ─────────────────────────────────────────────
  seo_source        text NOT NULL DEFAULT 'manual'
                      CHECK (seo_source IN ('manual','gemini','gemini_edited')),
  format_source     text NOT NULL DEFAULT 'manual'
                      CHECK (format_source IN ('manual','gemini','gemini_edited')),
  formatted_at      timestamptz NULL,
  format_model      text NULL,          -- which rung of the ladder answered
  created_by_email  text NULL,          -- admin_users.email
  updated_by_email  text NULL,          -- who last saved; the reviewer of record
  import_batch_id   uuid NULL           -- groups one bulk import
);

-- Lowercased on purpose. A slug is matched out of a URL, and /blogs/Title-Insurance
-- must not be able to coexist with /blogs/title-insurance as two different posts.
CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_key
  ON blog_posts (lower(slug));

-- The public listing query, and the only one that runs on every page view.
-- Partial: drafts are a rounding error on the public path and shouldn't be
-- carried in the index the reader's request walks.
CREATE INDEX IF NOT EXISTS blog_posts_published_idx
  ON blog_posts (published_at DESC) WHERE status = 'published';

CREATE INDEX IF NOT EXISTS blog_posts_batch_idx
  ON blog_posts (import_batch_id) WHERE import_batch_id IS NOT NULL;

-- RLS on with NO policies, so anon and authenticated get nothing directly.
--
-- Published posts are world-readable content, so the instinct is to add a
-- `USING (status = 'published')` policy for the anon key. Deliberately not
-- doing that, for two reasons. Every blog page here is a React Server
-- Component, so the browser never queries this table — the capability would go
-- unused. And an RLS policy filters ROWS, not COLUMNS: with anon read, anyone
-- who opens devtools also gets created_by_email and the unpublished
-- content_source of every published row. Column-level control needs a separate
-- view and its own grants, which is more moving parts than it buys.
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- The GRANT is NOT optional, and RLS is not a substitute for it.
--
-- service_role bypasses ROW-level security, but that says nothing about TABLE
-- privileges: without this grant every statement fails with 42501 "permission
-- denied for table blog_posts". See the same note on calculator_estimates, and
-- the silent-no-op rate limit it refers to in src/lib/rateLimit.ts.
--
-- DELETE is included here, unlike on calculator_estimates: a bulk import that
-- half-fails leaves orphan drafts that an admin has to be able to clear.
--
-- Re-running this line on a table that already has the grant is harmless.
GRANT SELECT, INSERT, UPDATE, DELETE ON blog_posts TO service_role;
