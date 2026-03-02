"use client";

import { Calendar, ArrowRight } from "lucide-react";
import Button from "@/components/ui/Button";
import Link from "next/link";
import Image from "next/image";

const blogPosts = [
  {
    id: 1,
    title: "Why Title Insurance Is Essential for Ontario Homebuyers",
    excerpt:
      "Why title insurance is essential protection for Ontario homebuyers and investors.",
    date: "February 27, 2026",
    status: "published" ,
    readTime: "5 min read",
    image: "/blog1.png",
  },
  {
    id: 2,
    title: "Disbursements: What Are They and Why Are You Paying Them?",
    excerpt:
      "Understanding disbursements in Ontario real estate transactions - the out-of-pocket expenses your lawyer incurs on your behalf.",
    date: "February 27, 2026",
    status: "published" ,
    readTime: "7 min read",
    image: "/blog2.png",
  },
  {
    id: 3,
    title: "Understanding Real Estate Transaction Costs: The Legal Side They Dont Tell You About",
    excerpt:
      "Breaking down the real estate transaction costs you will encounter in Ontario - and the ones most people overlook.",
    date: "February 27, 2026",
    status: "published" ,
    readTime: "4 min read",
    image: "/blog3.png",
  },
  {
    id: 4,
    title: "Legal Deed vs. Mortgage: Key Differences Explained",
    excerpt:
      "Clarify the differences between a legal deed and a mortgage and what each means for your property ownership.",
    date: "February 10, 2026",
    status: "published" ,
    readTime: "6 min read",
    image: "/blog1.png",
  },
  {
    id: 5,
    title: "First-Time Homebuyer: Common Mistakes to Avoid",
    excerpt:
      "Don't let common pitfalls derail your home purchase. Learn what first-time buyers should watch out for.",
    date: "February 5, 2026",
    status: "draft" ,
    readTime: "8 min read",
    image: "/blog2.png",
  },
  {
    id: 6,
    title: "The Role of Title Insurance in Your Property Purchase",
    excerpt:
      "Discover why title insurance is essential and how it protects your investment in real estate.",
    date: "January 30, 2026",
    status: "draft" ,
    readTime: "5 min read",
    image: "/blog3.png",
  },
];

export default function Blog() {
  const [featured, ...rest] = blogPosts;

  return (
    <div className="min-h-screen bg-[#fdfcfc]">

      <main className="mx-auto max-w-7xl px-6 py-5 sm:px-10  lg:px-14">

        {/* Section label  */}
        <div className="mb-12 text-center">
          <div className="mb-3 flex items-center justify-center gap-3">
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-[#C10007]/30" />
            <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#C10007]">
              Blog management
            </p>
            <span className="h-px w-12 bg-gradient-to-l from-transparent to-[#C10007]/30" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Create and manage your blog content
          </h2>
        </div>


        <Link href={`/blog/${featured.id}`} className="group mb-8 block">
          <article className="overflow-hidden rounded-3xl border border-[#f0e4e4] bg-white shadow-[0_4px_32px_rgba(0,0,0,0.07)] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-red-200/70 hover:shadow-[0_28px_72px_rgba(193,0,7,0.12)]">
            <div className="flex flex-col md:flex-row">


              <div className="relative min-h-[200px] w-full shrink-0 overflow-hidden md:min-h-[320px] md:w-[38%] lg:min-h-[360px]">
                <Image
                  src={featured.image}
                  alt={featured.title}
                  fill
                  className="object-cover"
                />
                {/* Featured badge */}
                <span className="absolute left-4 top-4 rounded-full bg-[#C10007] px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
                  Featured
                </span>
              </div>

              {/* — Content — */}
              <div className="flex flex-1 flex-col justify-center px-7 py-8 sm:px-10 lg:px-14 lg:py-12">

                <div className="mb-5 flex flex-wrap items-center gap-2.5">
                  <span className="rounded-full border border-red-100 bg-red-50 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#C10007]">
                    {featured.status}
                  </span>
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

        {/* cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-7">
          {rest.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.id}`}
              className="group block h-full"
            >
              <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] transition-all duration-300 ease-out hover:-translate-y-2 hover:border-red-100 hover:shadow-[0_20px_56px_rgba(193,0,7,0.10)]">

                <div className="relative h-48 w-full shrink-0 overflow-hidden">
                  <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    className="object-cover"
                  />
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col p-6">

                  {/* Meta */}
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#C10007]">
                      {post.status}
                    </span>
                    <span className="text-xs font-medium text-gray-400">
                      {post.readTime}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="mb-3 line-clamp-2 text-[15px] font-bold leading-snug text-gray-900 transition-colors duration-200 group-hover:text-[#C10007]">
                    {post.title}
                  </h3>

                  {/* Excerpt */}
                  <p className="mb-5 line-clamp-3 flex-1 text-[13px] leading-relaxed text-gray-500">
                    {post.excerpt}
                  </p>

                  {/* Card footer */}
                  <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                      <Calendar size={12} strokeWidth={2} />
                      <span>{post.date}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#C10007] transition-all duration-200 group-hover:gap-2.5">
                      Read more
                      <ArrowRight size={13} strokeWidth={2.5} />
                    </span>
                  </div>

                </div>
              </article>
            </Link>
          ))}
        </div>

        {/* ── Load More ────────────────────────────── */}
        <div className="mt-20 flex justify-center">
          <Button
            size="lg"
            className="px-14 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            Load More Articles
          </Button>
        </div>

      </main>
    </div>
  );
}
