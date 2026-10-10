/**
 * The "Quick answer" an article opens with, read back out of its body.
 *
 * Every one of these posts answers its own title in a sentence or two before
 * the prose starts:
 *
 *   <p><strong>Quick answer:</strong> A title search is your lawyer's review…</p>
 *   <p>Quick answer: Home policies commonly cover the dwelling, belongings…</p>
 *
 * That paragraph is the best short summary the article has — it was written to
 * answer the question in the heading, whereas `excerpt` is a marketing blurb
 * about the article ("Here is a look at what standard policies cover…"). So it
 * is what the title is now followed by, on the listing cards and at the top of
 * the article alike.
 *
 * Both markup shapes above occur in the published posts, which is why the label
 * is matched with the <strong> optional rather than assumed either way.
 *
 * Runs on HTML that sanitizeBlogHtml has ALREADY cleaned — the same contract
 * blogToc.ts and blogByline.ts work under.
 */

/**
 * How far into the body to look. The quick answer is the opening paragraph
 * (after the byline, which is stripped before this runs); a later paragraph
 * that happens to say "quick answer" is prose.
 */
const SEARCH_DEPTH = 3;

const PARAGRAPH = /<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi;

/** "Quick answer:" — bare, or wrapped in the <strong> an editor typed. */
const LABEL = /^\s*(?:<(?:strong|b)>)?\s*quick\s+answer\s*:?\s*(?:<\/(?:strong|b)>)?\s*:?\s*/i;

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
    .replace(/&[lr]squo;/gi, "'")
    .replace(/&[lr]dquo;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** The quick-answer paragraph: what it says, and where it sits in the HTML. */
function findQuickAnswer(
  sanitizedHtml: string
): { text: string; start: number; length: number } | null {
  PARAGRAPH.lastIndex = 0;
  let match: RegExpExecArray | null;
  let checked = 0;

  while ((match = PARAGRAPH.exec(sanitizedHtml)) !== null) {
    if (checked >= SEARCH_DEPTH) break;
    checked += 1;

    if (!LABEL.test(match[1])) continue;

    // Strip the label from the markup, then flatten — doing it in that order
    // means a <strong>-wrapped label is removed as markup rather than leaving
    // a stray "Quick answer:" behind once the tags come off.
    const text = plainText(match[1].replace(LABEL, ""));
    if (!text) continue; // A label with nothing after it is not a summary.

    // Take the whitespace after it too, so removing the paragraph does not
    // leave a blank gap where it used to be.
    const trailing = /^\s*/.exec(sanitizedHtml.slice(match.index + match[0].length));
    return {
      text,
      start: match.index,
      length: match[0].length + (trailing?.[0].length ?? 0),
    };
  }

  return null;
}

/** The article's own one-paragraph answer, label removed. Null when it has none. */
export function parseQuickAnswer(sanitizedHtml: string): string | null {
  return findQuickAnswer(sanitizedHtml)?.text ?? null;
}

/**
 * Removes the quick-answer paragraph from the body.
 *
 * The article page prints it directly under the title now, so leaving it in
 * place would open the page with the same sentences twice over. The summary is
 * not lost — it moves up the page, ahead of the prose, which is also where it
 * reads best.
 *
 * Only ever removes a paragraph parseQuickAnswer recognised; an article without
 * one is returned untouched.
 */
export function stripQuickAnswer(html: string): string {
  const found = findQuickAnswer(html);
  if (!found) return html;
  return html.slice(0, found.start) + html.slice(found.start + found.length);
}
