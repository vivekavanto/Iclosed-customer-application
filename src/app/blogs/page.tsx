import type { Metadata } from "next";
import Link from "next/link";
import BlogCoverImage from "@/components/blog/BlogCoverImage";
import { Calendar, ArrowRight, BookOpen } from "lucide-react";
import BlogSiteHeader from "@/components/layout/BlogSiteHeader";
import DashboardBlogCards from "@/components/blog/DashboardBlogCards";
import { listPublishedPosts } from "@/lib/blogPosts";

export const metadata: Metadata = {
  title: "Blog | iClosed — Real Estate Law Insights",
  description:
    "Real estate law insights, guides, and homeowner resources from the iClosed Real Estate Law Desk.",
};

// Posts come from the database now, so this page can go stale. Five minutes is
// the backstop; publishing calls revalidatePath("/blogs") and takes effect at
// once, so nobody waits on this timer in practice.
export const revalidate = 300;

export default async function BlogsIndexPage() {
  const posts = await listPublishedPosts();
  const [featured, ...rest] = posts;

  return (
    <div className="min-h-screen bg-[#fdfcfc]">
      <BlogSiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-gray-100 bg-white pt-16">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-[#C10007]" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3.5 py-1">
              <BookOpen size={13} className="text-[#C10007]" strokeWidth={2.2} />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#C10007]">
                iClosed Insights
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 leading-tight">
              Real estate law, made clear.
            </h1>
            <p className="mt-5 text-base sm:text-lg leading-relaxed text-gray-500 max-w-2xl">
              Guides, legal insights, and homeowner resources from the iClosed
              Real Estate Law Desk — designed to make every step of your
              Ontario closing feel less complicated.
            </p>
          </div>
        </div>
      </section>

      {/* Featured post */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* An empty blog is a real state now that posts live in a table — an
            unpublished-everything moment, or a database read that failed. The
            page keeps its header, hero and CTA rather than crashing on an
            undefined `featured`. */}
        {!featured && (
          <div className="rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center">
            <p className="text-base font-semibold text-gray-900">
              No articles published yet
            </p>
            <p className="mt-2 text-sm text-gray-500">
              New guides from the iClosed Real Estate Law Desk are on the way.
            </p>
          </div>
        )}

        {featured && (
        <Link href={`/blogs/${featured.slug}`} className="group mb-10 block">
          <article className="overflow-hidden rounded-3xl border border-[#f0e4e4] bg-white shadow-[0_4px_32px_rgba(0,0,0,0.07)] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-red-200/70 hover:shadow-[0_28px_72px_rgba(193,0,7,0.12)]">
            <div className="flex flex-col md:flex-row">
              <BlogCoverImage
                src={featured.image}
                alt={featured.imageAlt}
                priority
                sizes="(min-width: 768px) 42vw, 100vw"
                imageClassName="transition-transform duration-700 group-hover:scale-105"
                className="min-h-[220px] w-full shrink-0 md:min-h-[320px] md:w-[42%] lg:min-h-[380px]"
              >
                <span className="absolute left-4 top-4 rounded-full bg-[#C10007] px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
                  Featured
                </span>
              </BlogCoverImage>

              <div className="flex flex-1 flex-col justify-center px-7 py-8 sm:px-10 lg:px-14 lg:py-12">
                <div className="mb-5 flex flex-wrap items-center gap-2.5">
                  {featured.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#C10007]"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="text-xs font-medium text-gray-400">
                    {featured.readTime}
                  </span>
                </div>

                <h2 className="mb-4 text-2xl font-bold leading-snug text-gray-900 transition-colors duration-200 group-hover:text-[#C10007] lg:text-[1.85rem]">
                  {featured.title}
                </h2>
                {/* The article's own "Quick answer" under the title, which
                    answers the question the title asks where `excerpt` only
                    describes the article. Falls back for a post without one. */}
                <p className="mb-8 max-w-[520px] text-base leading-relaxed text-gray-500 line-clamp-4">
                  {featured.quickAnswer ?? featured.excerpt}
                </p>

                <div className="flex items-center justify-between border-t border-gray-100 pt-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-400">
                    <Calendar size={14} strokeWidth={2} />
                    <span>{featured.date}</span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#C10007] transition-all duration-200 group-hover:gap-3">
                    Read more
                    <ArrowRight size={15} strokeWidth={2.5} />
                  </span>
                </div>
              </div>
            </div>
          </article>
        </Link>
        )}

        {/* Rest of posts */}
        <DashboardBlogCards posts={rest} basePath="/blogs" />
      </main>

      {/* CTA Footer */}
      <section className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="rounded-3xl bg-gradient-to-br from-[#FEF2F2] to-white border border-red-100 px-6 py-10 sm:px-12 sm:py-14 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#C10007]">
              Have a question?
            </p>
            <h3 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
              Talk to a real estate lawyer at iClosed
            </h3>
            <p className="mt-4 text-sm sm:text-base text-gray-500 max-w-xl mx-auto leading-relaxed">
              Get answers in plain English from the team that handles thousands
              of Ontario closings every year.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/intake"
                className="inline-flex items-center gap-2 rounded-full bg-[#C10007] px-7 py-3 text-sm font-semibold !text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-lg"
              >
                Start your closing
                <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
              <a
                href="tel:4163211100"
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-7 py-3 text-sm font-semibold text-gray-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C10007] hover:text-[#C10007] hover:shadow-md"
              >
                Call (416) 321-1100
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
