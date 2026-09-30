import { Calendar, ArrowRight } from "lucide-react";
import Link from "next/link";
import BlogCoverImage from "@/components/blog/BlogCoverImage";
import DashboardBlogCards from "@/components/blog/DashboardBlogCards";
import { listPublishedPosts } from "@/lib/blogPosts";

// Reads the same table as the public /blogs pages. This used to be its own
// hardcoded array of six posts — with dates that disagreed with the public
// site's copy of the same articles — plus a third copy in [id]/page.tsx.
export const revalidate = 300;

export default async function Blog() {
  const publishedPosts = await listPublishedPosts();
  const [featured, ...rest] = publishedPosts;

  if (!featured) {
    return (
      <div className="min-h-screen bg-[#fdfcfc]">
        <main className="mx-auto max-w-7xl py-5">
          <div className="mb-12 text-center">
            <div className="mb-3 flex items-center justify-center gap-3">
              <span className="h-px w-12 bg-gradient-to-r from-transparent to-[#C10007]/30" />
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#C10007]">
                iClosed Insights
              </p>
              <span className="h-px w-12 bg-gradient-to-l from-transparent to-[#C10007]/30" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
              No published articles yet
            </h2>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfcfc]">

      <main className="mx-auto max-w-7xl py-5 ">

        {/* Section label  */}
        <div className="mb-12 text-center">
          <div className="mb-3 flex items-center justify-center gap-3">
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-[#C10007]/30" />
            <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#C10007]">
              iClosed Insights
            </p>
            <span className="h-px w-12 bg-gradient-to-l from-transparent to-[#C10007]/30" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Real estate law, made clear
          </h2>
        </div>


        <Link href={`/blog/${featured.slug}`} className="group mb-8 block">
          <article className="overflow-hidden rounded-3xl border border-[#f0e4e4] bg-white shadow-[0_4px_32px_rgba(0,0,0,0.07)] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-red-200/70 hover:shadow-[0_28px_72px_rgba(193,0,7,0.12)]">
            <div className="flex flex-col md:flex-row">


              <BlogCoverImage
                src={featured.image}
                alt={featured.imageAlt}
                sizes="(min-width: 768px) 38vw, 100vw"
                className="min-h-[200px] w-full shrink-0 md:min-h-[320px] md:w-[38%] lg:min-h-[360px]"
              >
                {/* Featured badge */}
                <span className="absolute left-4 top-4 rounded-full bg-[#C10007] px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
                  Featured
                </span>
              </BlogCoverImage>

              {/* — Content — */}
              <div className="flex flex-1 flex-col justify-center px-7 py-8 sm:px-10 lg:px-14 lg:py-12">

                <div className="mb-5 flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-medium text-gray-400">
                    {featured.readTime}
                  </span>
                </div>

                <h3 className="mb-4 text-2xl font-bold leading-snug text-gray-900 transition-colors duration-200 group-hover:text-[#C10007] lg:text-[1.85rem]">
                  {featured.title}
                </h3>
                <p className="mb-8 max-w-[480px] text-base leading-relaxed text-gray-500">
                  {featured.excerpt}
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

        <DashboardBlogCards posts={rest} />
      </main>
    </div>
  );
}
