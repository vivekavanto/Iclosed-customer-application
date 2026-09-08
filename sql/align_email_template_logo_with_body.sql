-- Align every email template's body with its logo (admin + web).
--
-- The `email_templates` table is SHARED: the admin app and the customer portal
-- both render these same rows, so this one statement fixes the layout in both.
-- No code change is involved — brandEmailHtml() only rewrites the logo's src and
-- width, never layout.
--
-- Two defects, both present only in a handful of rows:
--
--   1. `margin: 0 auto` centres the content wrapper, while the logo (see 2) sits
--      outside it and renders flush left. On a desktop client that leaves ~400px
--      between the two left edges.
--   2. The logo <img> is a SIBLING after the closing </div> instead of the last
--      child inside it, so it never inherits the wrapper's box.
--
-- 20 of the 29 templates already keep the logo inside the wrapper and do not
-- centre it ("Retainer Agreement Signed" is the reference). This brings the
-- 3 outliers onto that same convention rather than inventing a new one:
--   • "Sign Retainer"                  (centred + logo outside)
--   • " Activate your iClosed account" (centred + logo outside)
--   • "Citizenship Flag Notification"  (logo outside)
--
-- Idempotent: after it runs neither pattern matches, so re-running changes
-- nothing. Verified against all 29 live bodies — div tags stay balanced, the
-- logo is preserved, and no other row is touched.

BEGIN;

-- 1. Drop the auto-centring so the wrapper sits flush left, like the logo.
UPDATE email_templates
SET body = regexp_replace(body, 'margin:\s*0\s+auto\s*;', 'margin: 0;', 'gi')
WHERE body ~* 'margin:\s*0\s+auto';

-- 2. Move a trailing logo <img> from after </div> to inside it, as the last child.
UPDATE email_templates
SET body = regexp_replace(
      body,
      '</div>\s*(<img[^>]*logo\.png[^>]*>)\s*$',
      '\1</div>',
      'i'
    )
WHERE body ~* '</div>\s*<img[^>]*logo\.png[^>]*>\s*$';

COMMIT;

-- ── Verification: expect 0 rows ──────────────────────────────────────────────
SELECT id, name
FROM email_templates
WHERE body ~* 'margin:\s*0\s+auto'
   OR body ~* '</div>\s*<img[^>]*logo\.png[^>]*>\s*$';
