/**
 * The byline an author writes into the top of an article body, read back out.
 *
 * These posts open with a line like:
 *
 *   By Gathyayini Manoharan, Real Estate Lawyer and Practice Lead, iClosed ·
 *   Licensed by the Law Society of Ontario, LSO #75591T ·
 *   Last reviewed: September 2026 · Reading time: ~6 min
 *
 * which is the real attribution — and it disagreed with the page chrome around
 * it, because the chrome printed `blog_posts.author` ("iClosed Real Estate Law
 * Desk") and a reading time counted off the word count. One article therefore
 * named two different authors and two different reading times, a few hundred
 * pixels apart.
 *
 * The body is the copy an editor actually maintains, so it wins. What this
 * extracts feeds the post's own `author` / `readTime` fields (see
 * toBlogPost in blogPosts.ts), which every surface already renders — listing
 * card, article header, dashboard reader, structured data — so they agree
 * without each page having to know the byline exists. The line is then stripped
 * from the rendered body by cleanArticleBody, since the page now prints it.
 *
 * Runs on HTML that sanitizeBlogHtml has ALREADY cleaned, the same contract
 * blogToc.ts works under: after the sanitizer a paragraph is a bare <p> and the
 * inline markup is limited to the allowlist.
 */

export interface BlogByline {
  /** Just the name — "Gathyayini Manoharan". */
  author: string;
  /** What follows the name in the same clause, or null when there was none. */
  role: string | null;
  /** A licensing/credential segment, e.g. "Licensed by the Law Society…". */
  credentials: string | null;
  /** The "Last reviewed" value as written, e.g. "September 2026". */
  reviewed: string | null;
  /** Normalised to end in "read", e.g. "~6 min read". */
  readTime: string | null;
}

/**
 * How far into the body to look. The byline is the opening line; a paragraph
 * further down that happens to begin "By the time you…" is prose, not
 * attribution, and must not be mistaken for it — nor silently deleted.
 */
const SEARCH_DEPTH = 3;

/**
 * An upper bound on a byline's length. Prose beginning with "By " runs long;
 * this line is a handful of short segments. Generous enough for a name, a
 * title, a law-society reference, a review date and a reading time.
 */
const MAX_BYLINE_CHARS = 400;

const PARAGRAPH = /<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi;

/** The separators editors reach for between byline segments. */
const SEGMENT = /\s*(?:[·•|]|--|—|\s–\s)\s*/;

const OPENS_WITH_BY = /^by\s+/i;
const READING_TIME = /^(?:reading\s+time|read\s+time|reading)\s*:?\s*(.+)$/i;
const REVIEWED = /^(?:last\s+reviewed|reviewed|last\s+updated|updated)\s*:?\s*(.+)$/i;
const CREDENTIAL = /licen[cs]ed\b|law\s+society|\bLSO\s*#|\bbar\s+no/i;

/** Paragraph text as a reader sees it: no tags, no entities, no double spaces. */
function plainText(inner: string): string {
  return inner
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&middot;/gi, "·")
    .replace(/&bull;/gi, "•")
    .replace(/&[mn]dash;/gi, "—")
    .replace(/\s+/g, " ")
    .trim();
}

/** "~6 min" → "~6 min read"; "6 min read" is left as the author wrote it. */
function normaliseReadTime(value: string): string {
  const text = value.trim().replace(/[.,;]+$/, "");
  return /\bread\b/i.test(text) ? text : `${text} read`;
}

/**
 * A byline out of one paragraph's text, or null when that paragraph is not one.
 *
 * The name is taken up to the first comma, so the role ("Real Estate Lawyer and
 * Practice Lead, iClosed") stays out of the field that renders as an author —
 * the listing card and the structured data both want a person, not a person
 * plus their job title.
 */
function bylineFromText(text: string): BlogByline | null {
  if (!OPENS_WITH_BY.test(text)) return null;
  if (text.length > MAX_BYLINE_CHARS) return null;

  const segments = text.split(SEGMENT).map((s) => s.trim()).filter(Boolean);
  const [first, ...rest] = segments;

  const attribution = first.replace(OPENS_WITH_BY, "").trim();
  if (!attribution) return null;

  const comma = attribution.indexOf(",");
  const author = (comma === -1 ? attribution : attribution.slice(0, comma)).trim();
  const role = comma === -1 ? null : attribution.slice(comma + 1).trim() || null;

  // A name is a few words. Anything longer is a sentence that opened with
  // "By" — a byline with no separators at all, most likely, and not something
  // to print as an author or to delete from the article.
  if (!author || author.split(/\s+/).length > 6) return null;

  let credentials: string | null = null;
  let reviewed: string | null = null;
  let readTime: string | null = null;

  for (const segment of rest) {
    const read = READING_TIME.exec(segment);
    if (read) {
      readTime ??= normaliseReadTime(read[1]);
      continue;
    }

    const seen = REVIEWED.exec(segment);
    if (seen) {
      reviewed ??= seen[1].trim().replace(/[.,;]+$/, "");
      continue;
    }

    if (!credentials && CREDENTIAL.test(segment)) credentials = segment;
  }

  // One segment and nothing else is just "By Someone" — true, but it tells the
  // page nothing `author` did not already say, and stripping it would remove a
  // line the reader would otherwise still want.
  if (rest.length === 0 && !role) return null;

  return { author, role, credentials, reviewed, readTime };
}

/** The byline paragraph itself: what it says, and where it sits in the HTML. */
function findByline(
  sanitizedHtml: string
): { byline: BlogByline; start: number; length: number } | null {
  PARAGRAPH.lastIndex = 0;
  let match: RegExpExecArray | null;
  let checked = 0;

  while ((match = PARAGRAPH.exec(sanitizedHtml)) !== null) {
    if (checked >= SEARCH_DEPTH) break;
    checked += 1;

    const byline = bylineFromText(plainText(match[1]));
    if (byline) {
      // Take the whitespace after it too, so removing the paragraph does not
      // leave a blank gap where it used to be.
      const trailing = /^\s*/.exec(sanitizedHtml.slice(match.index + match[0].length));
      return {
        byline,
        start: match.index,
        length: match[0].length + (trailing?.[0].length ?? 0),
      };
    }
  }

  return null;
}

/** The article's own byline, or null when it does not carry one. */
export function parseBlogByline(sanitizedHtml: string): BlogByline | null {
  return findByline(sanitizedHtml)?.byline ?? null;
}

/**
 * Removes the byline paragraph from the body.
 *
 * Only ever removes a paragraph parseBlogByline recognised, and the page prints
 * the same information in its header — so this de-duplicates a line rather than
 * dropping content. An article with no byline is returned untouched.
 */
export function stripInlineByline(html: string): string {
  const found = findByline(html);
  if (!found) return html;
  return html.slice(0, found.start) + html.slice(found.start + found.length);
}
