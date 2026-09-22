import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
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
  const { previous, next, index, total } = position;

  // A blog with one post, or a post that is not in the published list, has no
  // series to speak of.
  if (!previous && !next) return null;

  const button =
    "inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-[13px] font-semibold transition-colors duration-200";

  return (
    <nav
      aria-label="Article series"
      className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 pt-6"
    >
      <div className="text-[13px] font-medium text-gray-400">
        Continue reading
        {index > 0 && (
          <span className="ml-2 tabular-nums text-gray-300">
            {index} of {total}
          </span>
        )}
      </div>

      {/* Bottom right, and in reading order: back on the left, forward on the
          right, matching where each one takes you. */}
      <div className="ml-auto flex items-center gap-2.5">
        {previous && (
          <Link
            href={`${basePath}/${previous.slug}`}
            rel="prev"
            // The visible label is only a direction; the title is what makes
            // the link meaningful out of context, which is how a screen reader
            // lists it.
            aria-label={`Previous article: ${previous.title}`}
            title={previous.title}
            className={`${button} border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900`}
          >
            <ArrowLeft size={14} strokeWidth={2.4} />
            Previous
          </Link>
        )}

        {next && (
          <Link
            href={`${basePath}/${next.slug}`}
            rel="next"
            aria-label={`Next article: ${next.title}`}
            title={next.title}
            className={`${button} border-[#C10007] bg-[#C10007] text-white hover:bg-red-700`}
          >
            Next
            <ArrowRight size={14} strokeWidth={2.4} />
          </Link>
        )}
      </div>
    </nav>
  );
}
