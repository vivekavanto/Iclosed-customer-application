import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Calendar, ArrowLeft, Clock, ShieldCheck, User } from "lucide-react";
import { getPublishedPost, listPublishedPosts } from "@/lib/blogPosts";
import BlogArticleBody from "@/components/blog/BlogArticleBody";
import BlogSeriesNav from "@/components/blog/BlogSeriesNav";
import { adjacentInSeries } from "@/lib/blogSeries";
import BlogToc from "@/components/blog/BlogToc";
import { buildBlogToc, cleanArticleBody } from "@/lib/blogToc";
import { sanitizeBlogHtml } from "@/lib/sanitizeBlogHtml";

/** Shared by the FAQ heading's id and the contents entry that points at it. */
const FAQ_ANCHOR = "article-faq";

/**
 * The dashboard's reader for a single article.
 *
 * Replaces (dashboard)/blog/[id]/page.tsx, which was a client component holding
 * a third hardcoded copy of the same article bodies keyed by a numeric id. Now
 * keyed by slug, so the dashboard and the public site address a post the same
 * way, and both read the one table. Nothing outside the app linked to the old
 * numeric URLs.
 */
export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  return {
    title: post ? `${post.title} | iClosed` : "Blog not found | iClosed",
  };
}

export default async function DashboardBlogPost({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);

  if (!post) notFound();

  // The same pass BlogArticleBody runs over the body, so every link in the
  // sidebar lands on an id that exists. See the public article page, which
  // derives its contents identically — the two must not drift apart.
  const { items: bodyToc } = buildBlogToc(
    cleanArticleBody(sanitizeBlogHtml(post.content), {
      hasRenderedFaq: post.faq.length > 0,
    })
  );

  // The FAQ is laid out by this page rather than inside the body HTML, so
  // buildBlogToc cannot see it. Listed last because that is where it sits.
  const tocItems =
    post.faq.length > 0 && !bodyToc.some((item) => item.id === FAQ_ANCHOR)
      ? [
          ...bodyToc,
          {
            id: FAQ_ANCHOR,
            text: "Frequently asked questions",
            level: 2 as const,
          },
        ]
      : bodyToc;

  const series = adjacentInSeries(await listPublishedPosts(), post.slug);

  return (
    <div className="min-h-screen bg-[#fdfcfc]">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-[#C10007]"
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
          Back to Blog
        </Link>

        <article>
          {/* A real cover only. When post.image was borrowed from the body
              (imageFromContent), the reader meets that picture a few
              paragraphs down — printing it as the hero as well shows the
              same image twice on the one page that renders the body. */}
          {post.image && !post.imageFromContent && (
            <div className="relative mb-8 h-64 w-full overflow-hidden rounded-3xl sm:h-80">
              <Image
                src={post.image}
                alt={post.imageAlt}
                fill
                className="object-cover"
                priority
              />
            </div>
          )}

          {post.tags.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#C10007]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <h1 className="mb-5 text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl">
            {post.title}
          </h1>

          {/* Author, date and reading time as the article itself states them:
              post.author and post.readTime come off the body's own byline when
              it carries one (see blogByline.ts), which is also why that line no
              longer appears in the prose below. */}
          <div className="mb-10 border-b border-gray-100 pb-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-400">
              <span className="inline-flex items-center gap-1.5">
                <User size={14} strokeWidth={2} />
                {post.author}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={14} strokeWidth={2} />
                {post.date}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={14} strokeWidth={2} />
                {post.readTime}
              </span>
              {post.reviewed && (
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck size={14} strokeWidth={2} />
                  Last reviewed {post.reviewed}
                </span>
              )}
            </div>
            {(post.authorRole || post.authorCredentials) && (
              <p className="mt-2 text-[13px] leading-relaxed text-gray-400">
                {[post.authorRole, post.authorCredentials]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>

          {/* Table of contents. Sticky beside the article on a wide screen,
              above it on a narrow one where there is no column to stick to.
              Renders nothing at all for a post with fewer than two headings. */}
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
            <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[300px]">
              <BlogToc items={tocItems} />
            </aside>

            <div className="min-w-0 flex-1">
              <BlogArticleBody
                html={post.content}
                hasRenderedFaq={post.faq.length > 0}
              />

              {post.faq.length > 0 && (
                <section className="mb-12">
                  <h2
                    id={FAQ_ANCHOR}
                    className="mb-6 scroll-mt-8 border-l-[3px] border-[#C10007] pl-5 text-xl font-bold tracking-tight text-gray-900"
                  >
                    Frequently asked questions
                  </h2>
                  <div className="space-y-4">
                    {post.faq.map((item) => (
                      <details
                        key={item.question}
                        className="rounded-2xl border border-gray-100 bg-white px-6 py-4"
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
            </div>
          </div>
        </article>

        {/* Where this article sits in the run, and what to read next. */}
        <BlogSeriesNav position={series} basePath="/blog" />
      </main>
    </div>
  );
}
