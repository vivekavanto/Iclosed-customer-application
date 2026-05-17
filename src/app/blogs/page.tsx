import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Calendar, ArrowRight, BookOpen } from "lucide-react";
import HomeHeaderAuth from "@/components/layout/HomeHeaderAuth";
import { blogPosts } from "./blogData";

export const metadata: Metadata = {
  title: "Blog | iClosed — Real Estate Law Insights",
  description:
    "Real estate law insights, guides, and homeowner resources from the iClosed Real Estate Law Desk.",
};

function IClosedLogo() {
  return (
    <Link href="/" className="flex items-center select-none flex-shrink-0">
      <span
        className="text-[#C10007] font-bold italic text-xl leading-none"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        i
      </span>
      <span className="text-gray-900 font-bold text-xl leading-none tracking-tight">
        Closed
      </span>
    </Link>
  );
}

export default function BlogsIndexPage() {
  const [featured, ...rest] = blogPosts;

  return (
    <div className="min-h-screen bg-[#fdfcfc]">
      {/* Public header */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <IClosedLogo />
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Home
            </Link>
            <Link
              href="/blogs"
              className="text-sm font-medium text-[#C10007]"
            >
              Blog
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <HomeHeaderAuth />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-gray-100 bg-white">
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
        <Link href={`/blogs/${featured.slug}`} className="group mb-10 block">
          <article className="overflow-hidden rounded-3xl border border-[#f0e4e4] bg-white shadow-[0_4px_32px_rgba(0,0,0,0.07)] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-red-200/70 hover:shadow-[0_28px_72px_rgba(193,0,7,0.12)]">
            <div className="flex flex-col md:flex-row">
              <div className="relative min-h-[220px] w-full shrink-0 overflow-hidden md:min-h-[320px] md:w-[42%] lg:min-h-[380px]">
                <Image
                  src={featured.image}
                  alt={featured.title}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  priority
                />
                <span className="absolute left-4 top-4 rounded-full bg-[#C10007] px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
                  Featured
                </span>
              </div>

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
                <p className="mb-8 max-w-[520px] text-base leading-relaxed text-gray-500">
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

        {/* Rest of posts */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:gap-7">
          {rest.map((post) => (
            <Link
              key={post.slug}
              href={`/blogs/${post.slug}`}
              className="group block h-full"
            >
              <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] transition-all duration-300 ease-out hover:-translate-y-2 hover:border-red-100 hover:shadow-[0_20px_56px_rgba(193,0,7,0.10)]">
                <div className="relative h-52 w-full shrink-0 overflow-hidden">
                  <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>

                <div className="flex flex-1 flex-col p-6">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {post.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#C10007]"
                      >
                        {tag}
                      </span>
                    ))}
                    <span className="text-xs font-medium text-gray-400">
                      {post.readTime}
                    </span>
                  </div>

                  <h3 className="mb-3 line-clamp-2 text-base font-bold leading-snug text-gray-900 transition-colors duration-200 group-hover:text-[#C10007]">
                    {post.title}
                  </h3>

                  <p className="mb-5 line-clamp-3 flex-1 text-[13.5px] leading-relaxed text-gray-500">
                    {post.excerpt}
                  </p>

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
                className="inline-flex items-center gap-2 rounded-full bg-[#C10007] px-7 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-lg"
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
