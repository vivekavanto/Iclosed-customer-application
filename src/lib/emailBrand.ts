import { getFirm, type FirmKey, type FirmProfile } from "@/lib/firms";

/**
 * Re-brand a rendered email body for the firm the file belongs to.
 *
 * MIRROR of the admin app's `iclosed_dev_admin/src/lib/emailBrand.ts` — both
 * repos render the SAME `email_templates` rows out of the shared database, so
 * both have to re-brand them the same way or a client gets one firm's logo from
 * the admin app and the other's from the portal.
 *
 * ── Why a post-render rewrite ───────────────────────────────────────────
 * The lockup is not injected by any send code: it is a literal
 * `<img src="https://<admin-host>/email-logo.png" width="85" …>` inside each
 * template row. Replacing it with a placeholder would take effect the moment
 * the migration ran — including on builds that had not learned to resolve the
 * new token, where it would reach clients as the literal text
 * "{{ brand_logo }}". So the rows are left exactly as they are and the rendered
 * HTML is rewritten instead.
 *
 * ── What gets rewritten, and what does not ──────────────────────────────
 * Only the src FILENAME and the width. The origin is untouched: the images are
 * served by the ADMIN app, so this repo never has to know — or keep in step
 * with — the admin app's public URL. The width has to move with the filename
 * because the two firms' artwork is cropped very differently and a shared width
 * renders the wordmark at two different sizes; see FirmProfile.emailLogoWidth.
 *
 * Apply to the final HTML immediately before handing it to Resend.
 */

/** Every `<img …>` in the body. Which of them is the logo is decided below. */
const IMG_TAG_RE = /<img\b[^>]*>/gi;

/**
 * The filenames that count as "the brand lockup" in a template's src:
 * `email-logo.png` (Nava Wilson) and `logo.png` (iClosed LLP), plus any older
 * `email-logo-<something>.png`. Keep in step with FIRMS[...].emailLogoFile.
 *
 * The ["'/] before the filename is load-bearing. Without it an unrelated asset
 * that merely ENDS in "logo.png" - a partner's `brokerage-logo.png`, say -
 * would match and be silently replaced with this firm's lockup.
 */
const LOGO_SRC_RE =
  /(<img\b[^>]*\bsrc\s*=\s*["'][^"']*?["'\/])(?:email-logo(?:-[a-z0-9]+)?|logo)\.png/i;

/** The token a template may use to name the firm in prose. */
const FIRM_NAME_TOKEN_RE = /\{\{\s*(?:firm_name|firm_legal_name|firm)\s*\}\}/gi;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Point one `<img>` tag at `profile`'s lockup, at `profile`'s width.
 *
 * The width is carried in two places and BOTH must move together — the HTML
 * attribute is what Outlook reads, the inline style is what everything else
 * reads. Updating one and not the other leaves the logo at its old size in
 * exactly the clients you were not looking at.
 */
function rebrandImgTag(tag: string, profile: FirmProfile): string {
  const w = profile.emailLogoWidth;
  return tag
    .replace(LOGO_SRC_RE, (_m, head: string) => `${head}${profile.emailLogoFile}`)
    .replace(/(\s)width\s*=\s*["']\d+["']/i, `$1width="${w}"`)
    // The leading boundary is load-bearing: without it this also matches the
    // tail of `max-width:600px` and rewrites the wrong declaration.
    .replace(/(^|[;"'\s])width\s*:\s*\d+px/gi, `$1width:${w}px`)
    // `max-width:100%` is left alone — only a px cap needs to follow the width.
    .replace(/max-width\s*:\s*\d+px/gi, `max-width:${w}px`);
}

/**
 * Rewrite a rendered email body for `firm`.
 *
 * Safe on a body with no logo, on one already branded for the right firm, and
 * on one branded for the wrong firm — all three converge on the same output.
 */
export function brandEmailHtml(
  html: string,
  firm: FirmKey | FirmProfile | null | undefined,
): string {
  if (!html) return html;

  const profile =
    typeof firm === "object" && firm !== null ? firm : getFirm(firm);

  return html
    .replace(IMG_TAG_RE, (tag) =>
      LOGO_SRC_RE.test(tag) ? rebrandImgTag(tag, profile) : tag,
    )
    .replace(FIRM_NAME_TOKEN_RE, escapeHtml(profile.legalName));
}
