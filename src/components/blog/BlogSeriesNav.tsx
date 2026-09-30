import Link from "next/link";
import type { SeriesPosition } from "@/lib/blogSeries";

/**
 * "Continue reading" — previous and next, as a pair of buttons at the foot of
 * an article.
 *
 * The reader's place in a sequence: Part 3 of 9, here is 2, here is 4. It
 * replaced a "Keep reading" block of two recent posts — two arbitrary articles
 * are a worse answer to "what now?" than the next one in the run, which is the
 * path nearly everyone finishing an article actually takes.
 *
 * Two plain buttons rather than title cards. The article titles are long
 * enough to wrap in any button that holds them, which is what made the earlier
 * versions look busy; "Previous" and "Next" are short, the same width every
 * time, and are the only thing a reader at the end of a page is looking for.
 * Each link carries the destination's title as its accessible name, so nothing
 * is lost for a screen reader or on hover.
 *
 * Next is the filled button because going forward is the common move; previous
 * is outlined, so the pair reads as one primary action and one secondary.
 *
 * Plain links, rendered on the server. Nothing here needs to be interactive,
 * so nothing here ships JavaScript.
 */
export default function BlogSeriesNav({
  position,
  basePath = "/blogs",
}: {
  position: SeriesPosition;
  /**
   * Where an article lives for this reader: "/blogs" on the public site,
   * "/blog" in the dashboard. Getting it wrong sends a signed-in reader out
   * of the dashboard mid-series.
   */
  basePath?: string;
}) {
  const { previous, next } = position;

  // A blog with one post, or a post that is not in the published list, has no
  // series to speak of.
  if (!previous && !next) return null;

  return (
    <nav
      aria-label="Article series"
      className="mt-12 border-t border-gray-100 pt-6 text-[13px] leading-relaxed"
    >
      <div className="flex flex-wrap items-center gap-2 text-gray-500">
        <span className="font-semibold text-gray-700">Continue the series:</span>
        {previous && (
          <Link
            href={`${basePath}/${previous.slug}`}
            rel="prev"
            aria-label={`Previous article: ${previous.title}`}
            title={previous.title}
            className="inline-flex items-center gap-1.5 font-medium text-gray-600 transition-colors hover:text-[#C10007] hover:underline"
          >
            <span className="font-bold text-[#C10007]">
              Previous
            </span>
            <span>: {previous.title}</span>
          </Link>
        )}
        {previous && next && <span className="font-semibold text-gray-300">|</span>}
        {next && (
          <Link
            href={`${basePath}/${next.slug}`}
            rel="next"
            aria-label={`Next article: ${next.title}`}
            title={next.title}
            className="inline-flex items-center gap-1.5 font-medium text-gray-600 transition-colors hover:text-[#C10007] hover:underline"
          >
            <span className="font-bold text-[#C10007]">
              Next
            </span>
            <span>: {next.title}</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
