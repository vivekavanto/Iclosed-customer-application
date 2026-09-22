/**
 * The "On this page" contents for an article, and the heading ids it points at.
 *
 * Both halves come out of one function on purpose. The anchors in the sidebar
 * and the ids in the body are generated from the same pass over the same
 * string, so a link can never point at an id the article does not contain —
 * which is exactly what happens the moment two separate slugifiers drift.
 *
 * It runs on HTML that sanitizeBlogHtml has ALREADY cleaned, never on raw
 * stored HTML. That ordering matters twice over: the sanitizer strips `id`
 * attributes (see its allowlist), so ids injected before it would simply
 * vanish; and after it, a heading is guaranteed to be a bare `<h2>`/`<h3>`
 * with no attributes, which is what the match below relies on.
 */

export interface BlogTocItem {
  /** The value of the heading's `id`, and the fragment the sidebar links to. */
  id: string;
  /** Heading text with markup stripped — what the sidebar prints. */
  text: string;
  /** 2 for an <h2> (a numbered entry), 3 for an <h3> (indented under it). */
  level: 2 | 3;
}

// Tolerates an attribute list on the opening tag, so a second pass over
// already-tagged HTML still finds its headings. After the sanitizer there are
// no attributes — but the id this function itself adds is exactly such an
// attribute, and without this it would report "no headings" when fed its own
// output. Attributes are dropped on the way out; the id is recomputed.
const HEADING = /<(h2|h3)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;

/** Heading text as a reader sees it: no tags, no entities, no runs of space. */
function headingText(inner: string): string {
  return inner
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A URL fragment from heading text. Kept to [a-z0-9-] so the result is always
 * safe to drop into an `id="..."` attribute unescaped and always valid in a
 * `#hash`, whatever the author typed.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export interface BlogToc {
  /** The same HTML, with an `id` added to every h2/h3. */
  html: string;
  items: BlogTocItem[];
}

/**
 * Idempotent: running it on its own output produces the same ids, because the
 * ids are derived from heading text rather than from a counter over headings
 * that lack one. The page (for the sidebar) and BlogArticleBody (for the body)
 * both call it on the same post, and have to agree without sharing state.
 */
export function buildBlogToc(sanitizedHtml: string): BlogToc {
  const items: BlogTocItem[] = [];
  // Two articles can legitimately repeat a heading ("Overview" twice). Ids
  // must still be unique or the browser jumps to the first one every time.
  const seen = new Map<string, number>();

  const html = sanitizedHtml.replace(
    HEADING,
    (_match, tag: string, inner: string) => {
      const level = tag.toLowerCase() === "h2" ? 2 : 3;
      const text = headingText(inner);
      const base = slugify(text) || `section-${items.length + 1}`;

      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      const id = count === 0 ? base : `${base}-${count + 1}`;

      // An empty heading is a layout artefact, not a section — give it an id so
      // the body stays valid, but keep it out of the contents list.
      if (text) items.push({ id, text, level: level as 2 | 3 });

      return `<${tag} id="${id}">${inner}</${tag}>`;
    }
  );

  return { html, items };
}

// An "On this page" label an author typed into the body: a heading or a bold
// paragraph, whatever level they reached for. Matched on text rather than tag
// because there is no convention to rely on — editors produce <h2>, <h3> and
// <p><strong> for the same intent.
const INLINE_TOC_LABEL =
  /<(h[1-6]|p)(?:\s[^>]*)?>\s*(?:<(?:strong|b)>)?\s*(?:on this page|table of contents|contents|in this article)\s*:?\s*(?:<\/(?:strong|b)>)?\s*<\/\1>\s*/i;

/** The list that follows the label — that list IS the contents. */
const FOLLOWING_LIST = /^<(ul|ol)(?:\s[^>]*)?>[\s\S]*?<\/\1>\s*/i;

/**
 * Removes a contents list the author wrote into the article body.
 *
 * The sidebar is generated from the article's own headings, so a hand-written
 * copy in the body is the same list printed twice — and the hand-written one
 * is the copy that goes stale, because nothing updates it when a heading is
 * renamed. Only the label plus the single list directly after it is removed;
 * a bold "Contents:" with prose under it is left alone.
 *
 * Runs BEFORE buildBlogToc: the label is often an <h2>/<h3>, and left in place
 * it would show up in the sidebar as a section called "On this page".
 */
export function stripInlineToc(html: string): string {
  const label = INLINE_TOC_LABEL.exec(html);
  if (!label) return html;

  const after = html.slice(label.index + label[0].length);
  const list = FOLLOWING_LIST.exec(after);
  if (!list) return html; // A label with no list under it is just a sentence.

  return html.slice(0, label.index) + after.slice(list[0].length);
}

/**
 * A "Continue the series: « … | Next: … »" line an author typed into the body.
 *
 * Matched on the opening words rather than the whole sentence, because the
 * tail varies with where the post sits in the run ("Start of the series",
 * "Previous: …", "Next: …", or only one of them on the first and last posts).
 */
const INLINE_SERIES_NAV =
  /<p(?:\s[^>]*)?>\s*(?:<(?:strong|b|em|i)>\s*)?(?:continue the series|continue reading the series|series navigation)\b[\s\S]*?<\/p>\s*/gi;

/**
 * Removes a hand-written series navigation line from the article body.
 *
 * BlogSeriesNav renders the same thing at the foot of the page from the
 * published list — as real <Link>s, with the reader's position in the run, and
 * always pointing at posts that still exist. The copy in the body is the one
 * that rots: it is prose, so its "next" is whatever was next on the day it was
 * written, and in these posts it is not even a link, just grey text naming an
 * article with no way to reach it.
 *
 * Only a paragraph that OPENS with the phrase is removed. A sentence that
 * mentions the series in passing ("...as we saw earlier in the series") does
 * not start that way and is left alone.
 */
export function stripInlineSeriesNav(html: string): string {
  return html.replace(INLINE_SERIES_NAV, "");
}

/**
 * The body as the page should render it: the author's prose, minus the blocks
 * the layout now renders for itself.
 *
 * One function rather than three calls at each site, because the page (for the
 * sidebar) and BlogArticleBody (for the body) each run this independently and
 * have to agree exactly. Applying one stripper and forgetting another would
 * put a heading in the sidebar that the body no longer contains.
 *
 * `hasRenderedFaq` must be the same answer both callers give — it is
 * `post.faq.length > 0`, the condition the page uses to decide whether to
 * render its own FAQ block. Passing it true where the page renders nothing
 * would silently delete the article's only FAQ.
 *
 * Input must already be sanitized — see the note at the top of this file.
 */
export function cleanArticleBody(
  sanitizedHtml: string,
  { hasRenderedFaq = false }: { hasRenderedFaq?: boolean } = {}
): string {
  const html = stripInlineSeriesNav(stripInlineToc(sanitizedHtml));
  return hasRenderedFaq ? stripInlineFaq(html) : html;
}

/**
 * An "FAQ" heading the author wrote into the body, in the spellings editors
 * actually produce. Anchored on the whole heading text so a section genuinely
 * called "FAQ for first-time buyers" — a real section with real prose — is not
 * mistaken for the boilerplate block.
 */
const INLINE_FAQ_HEADING =
  /<(h[2-4])(?:\s[^>]*)?>\s*(?:<(?:strong|b)>)?\s*(?:faqs?|frequently\s+asked\s+questions(?:\s*\(faq\))?)\s*:?\s*(?:<\/(?:strong|b)>)?\s*<\/\1>/i;

/**
 * Removes an FAQ section the author wrote into the article body.
 *
 * The page renders post.faq itself, as accordions, and submits that same array
 * as FAQPage structured data — structured data must never describe content a
 * visitor cannot see, so the rendered block is not optional. An FAQ in the body
 * as well means the reader answers the same questions twice on one page.
 *
 * The body copy is the one to drop: post.faq is a field an editor maintains and
 * the markup can restyle, whereas the body copy is frozen prose that no longer
 * matches once a question is edited in the admin.
 *
 * Only called when the page has a post.faq to render in its place — a post
 * whose ONLY FAQ is the one in its body keeps it, because removing it would
 * delete content rather than de-duplicate it.
 *
 * Takes the heading and everything under it up to the next heading of the same
 * or higher level ("About the author", typically), which is where the section
 * ends. A trailing FAQ with nothing after it runs to the end of the body.
 */
export function stripInlineFaq(html: string): string {
  const heading = INLINE_FAQ_HEADING.exec(html);
  if (!heading) return html;

  const level = Number(heading[1][1]);
  const bodyStart = heading.index + heading[0].length;

  // A heading that closes the section: same level or more significant. An <h3>
  // inside the FAQ (one question styled as a subheading) is deeper, so it is
  // correctly treated as part of the section rather than as its end.
  const sibling = new RegExp(`<h[1-${level}](?:\s[^>]*)?>`, "i").exec(
    html.slice(bodyStart)
  );

  const end = sibling ? bodyStart + sibling.index : html.length;
  return html.slice(0, heading.index) + html.slice(end);
}
