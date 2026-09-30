import type { BlogPost } from "./blogPosts";

/**
 * Where one article sits in the run of published posts, and what comes next.
 *
 * The blog is written as a series — each article ends by pointing at the one
 * after it ("Next: What Conditions Should I Put in My Offer…") — but until
 * now that pointer was prose the author typed, which goes stale the moment
 * anything is published out of order or unpublished. This derives the same
 * thing from the posts themselves.
 *
 * Reading order is publication order, oldest first: "next" is the article
 * published AFTER this one, which is the opposite of the listing page's
 * newest-first order. No series column and no manual ordering — if a curated
 * running order is ever wanted, this is the one place that decides it.
 */

export type SeriesPosition = {
  previous: BlogPost | null;
  next: BlogPost | null;
  /** 1-based, in reading order. */
  index: number;
  total: number;
};

/**
 * Reading order.
 *
 * Falls back to nothing when `publishedAt` is missing — a scheduled post can
 * have a null there — so those sort last rather than being dropped from the
 * series, and ties break on slug so the order is stable between renders
 * rather than depending on what the database happened to return.
 */
function inReadingOrder(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort((a, b) => {
    const at = a.publishedAt ? Date.parse(a.publishedAt) : Number.MAX_SAFE_INTEGER;
    const bt = b.publishedAt ? Date.parse(b.publishedAt) : Number.MAX_SAFE_INTEGER;
    if (at !== bt) return at - bt;
    return a.slug.localeCompare(b.slug);
  });
}

/**
 * The neighbours of `slug` within `posts`.
 *
 * Takes the list the page has already fetched rather than querying again:
 * every caller is rendering a page that needed the full published list
 * anyway, and a second round trip for the two adjacent rows would be a query
 * to learn something already in memory.
 *
 * A slug that is not in the list (an unpublished post being previewed, say)
 * gets an empty position rather than a wrong one.
 */
export function adjacentInSeries(posts: BlogPost[], slug: string): SeriesPosition {
  const ordered = inReadingOrder(posts);
  const at = ordered.findIndex((p) => p.slug === slug);

  if (at === -1) {
    return { previous: null, next: null, index: 0, total: ordered.length };
  }

  return {
    previous: ordered[at - 1] ?? null,
    next: ordered[at + 1] ?? null,
    index: at + 1,
    total: ordered.length,
  };
}
