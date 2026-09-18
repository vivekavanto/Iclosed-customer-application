import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  Calendar,
  ArrowLeft,
  ArrowRight,
  Phone,
  Mail,
  MapPin,
} from "lucide-react";
import HomeHeaderAuth from "@/components/layout/HomeHeaderAuth";
import {
  listPublishedPosts,
  listPublishedSlugs,
  getPublishedPost,
} from "@/lib/blogPosts";
import ShareButtons from "./ShareButtons";
import BlogArticleBody from "@/components/blog/BlogArticleBody";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const revalidate = 300;

export async function generateStaticParams() {
  // Published only — a draft must never be prerendered into the build output.
  // `dynamicParams` stays at its default, so a post published after the last
  // build still renders on its first request instead of 404ing until a deploy.
  const slugs = await listPublishedSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);

  if (!post) {
    return { title: "Blog not found | iClosed" };
  }

  // meta_* are what Google prints; title/excerpt are what a human reads on the
  // page. They are allowed to differ, and a post that was never hand-tuned
  // falls back to the human-facing pair rather than rendering nothing.
  const title = post.metaTitle ?? `${post.title} | iClosed`;
  const description = post.metaDescription ?? post.excerpt;
  const image = post.ogImageUrl ?? post.image;

  return {
    title,
    description,
    keywords: post.tags,
    authors: [{ name: post.author }],
    alternates: { canonical: post.canonicalUrl ?? `/blogs/${post.slug}` },
    robots: post.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "article",
      siteName: "iClosed",
      locale: "en_CA",
      url: `/blogs/${post.slug}`,
      title: post.metaTitle ?? post.title,
      description,
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      authors: [post.author],
      tags: post.tags,
      images: [{ url: image, width: 1200, height: 630, alt: post.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.metaTitle ?? post.title,
      description,
      images: [image],
    },
  };
}

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

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = (await listPublishedPosts())
    .filter((p) => p.slug !== post.slug)
    .slice(0, 2);

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

      {/* Hero + Image Row */}
      <section className="relative bg-white">
        <div className="h-[3px] bg-[#C10007]" />

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-14 lg:px-8">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-14">
            <div className="flex flex-1 flex-col">
              <Link
                href="/blogs"
                className="group mb-8 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#C10007] transition-colors duration-200 hover:text-red-700"
              >
                <ArrowLeft
                  size={14}
                  strokeWidth={2.5}
                  className="transition-transform duration-200 group-hover:-translate-x-1"
                />
                Back to Blog
              </Link>

              <div className="mb-5 flex flex-wrap items-center gap-2.5">
                {post.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-red-100 bg-red-50 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-[#C10007]"
                  >
                    {tag}
                  </span>
                ))}
                <span className="text-[11px] font-medium text-gray-400">
                  {post.readTime}
                </span>
              </div>

              <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl lg:text-[2.4rem] lg:leading-[1.18]">
                {post.title}
              </h1>

              <p className="mb-6 text-[16.5px] leading-relaxed text-gray-500">
                {post.excerpt}
              </p>

              <div className="mb-8 flex flex-wrap items-center gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3.5 py-1 text-[11px] font-semibold text-gray-500 transition-colors duration-150 hover:border-red-100 hover:bg-red-50 hover:text-[#C10007]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-6 border-t border-gray-100 pt-6">
                <div className="flex items-center gap-2">
                  <Calendar size={13} strokeWidth={2} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-500">
                    {post.date}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-100 bg-red-50">
                    <span className="text-[11px] font-bold text-[#C10007]">
                      {post.author.charAt(0)}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    By {post.author}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative h-64 w-full shrink-0 overflow-hidden rounded-3xl shadow-[0_8px_48px_rgba(0,0,0,0.09)] ring-1 ring-gray-100 sm:h-80 lg:h-[420px] lg:w-[46%]">
              <Image
                src={post.image}
                alt={post.title}
                fill
                className="object-cover transition-transform duration-700 hover:scale-[1.02]"
                priority
              />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/10 to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <BlogArticleBody html={post.content} />

        {/* The FAQ block. Rendered from the same data that becomes FAQPage
            JSON-LD — structured data must never describe content a visitor
            cannot see, and this is also the passage an AI Overview quotes. */}
        {post.faq.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-6 border-l-[3px] border-[#C10007] pl-5 text-xl font-bold tracking-tight text-gray-900">
              Frequently asked questions
            </h2>
            <div className="space-y-4">
              {post.faq.map((item) => (
                <details
                  key={item.question}
                  className="group rounded-2xl border border-gray-100 bg-white px-6 py-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
                >
                  <summary className="cursor-pointer list-none text-[15.5px] font-semibold text-gray-900 marker:hidden">
                    {item.question}
                  </summary>
                  <p className="mt-3 text-[15.5px] leading-[1.8] text-gray-600">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* Share + Contact card */}
        <ShareButtons title={post.title} />

        {/* Contact details */}
        <div className="mt-8 rounded-2xl border border-gray-100 bg-gradient-to-br from-[#FEF2F2] to-white px-6 sm:px-10 py-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#C10007]">
            Speak with a real estate lawyer
          </p>
          <h3 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
            Have questions about your closing?
          </h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <a
              href="tel:4163211100"
              className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C10007] hover:shadow-md"
            >
              <Phone size={16} className="text-[#C10007]" strokeWidth={2.2} />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Call
                </p>
                <p className="text-sm font-semibold text-gray-800">
                  (416) 321-1100
                </p>
              </div>
            </a>
            <a
              href="mailto:info@iclosed.ca"
              className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C10007] hover:shadow-md"
            >
              <Mail size={16} className="text-[#C10007]" strokeWidth={2.2} />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Email
                </p>
                <p className="text-sm font-semibold text-gray-800">
                  info@iclosed.ca
                </p>
              </div>
            </a>
            <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3">
              <MapPin size={16} className="text-[#C10007]" strokeWidth={2.2} />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Office
                </p>
                <p className="text-sm font-semibold text-gray-800">
                  Toronto, ON
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Related */}
        {relatedPosts.length > 0 && (
          <div className="mt-16">
            <div className="mb-6 flex items-end justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#C10007]">
                  Keep reading
                </p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
                  More from the Law Desk
                </h3>
              </div>
              <Link
                href="/blogs"
                className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-[#C10007] hover:gap-2.5 transition-all"
              >
                All articles
                <ArrowRight size={14} strokeWidth={2.5} />
              </Link>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {relatedPosts.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blogs/${p.slug}`}
                  className="group block h-full"
                >
                  <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-red-100 hover:shadow-[0_20px_56px_rgba(193,0,7,0.10)]">
                    <div className="relative h-44 w-full shrink-0 overflow-hidden">
                      <Image
                        src={p.image}
                        alt={p.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <span className="text-xs font-medium text-gray-400 mb-2">
                        {p.readTime}
                      </span>
                      <h4 className="line-clamp-2 text-[15px] font-bold leading-snug text-gray-900 transition-colors duration-200 group-hover:text-[#C10007]">
                        {p.title}
                      </h4>
                      <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-[#C10007] transition-all duration-200 group-hover:gap-2.5">
                        Read article
                        <ArrowRight size={13} strokeWidth={2.5} />
                      </span>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
