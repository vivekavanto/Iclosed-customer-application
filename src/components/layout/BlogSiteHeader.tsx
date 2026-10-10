import Link from "next/link";
import HomeHeaderAuth from "@/components/layout/HomeHeaderAuth";

/**
 * The public site header, shared by the blog listing and every article page.
 *
 * It used to exist twice: /blogs had this bar (logo, Blog, "Start your
 * closing", the auth control), while /blogs/[slug] had a shorter one of its own
 * with a Home/Blog nav and no call to action. Following a card from the listing
 * into an article therefore changed the header out from under the reader and
 * dropped the only way to start a closing from the page where they had just
 * finished reading about one.
 *
 * `fixed` rather than `sticky`, as the listing's copy always was — so callers
 * must leave 4rem of room at the top of their first section (pt-16), which is
 * this bar's height.
 */
export default function BlogSiteHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 bg-white/95 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto w-full h-full px-5 sm:px-8 lg:px-10 flex items-center justify-between">
        <Link href="/" className="flex items-center select-none">
          <span
            className="text-[#C10007] font-bold italic text-xl leading-none"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            i
          </span>
          <span className="font-bold text-xl text-gray-900 tracking-tight leading-none">
            Closed
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/blogs"
            className="hidden sm:inline-flex px-3 sm:px-4 py-2 text-sm font-medium text-gray-600 rounded-sm hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            Blog
          </Link>
          <Link
            href="/intake"
            className="px-3 sm:px-5 py-2 text-sm font-semibold !text-white bg-[#C10007] rounded-sm hover:bg-[#a00006] transition-colors shadow-sm"
          >
            <span className="hidden sm:inline">Start your closing</span>
            <span className="sm:hidden">Get started</span>
          </Link>
          <HomeHeaderAuth />
        </div>
      </div>
    </header>
  );
}
