import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Calendar, ArrowLeft, Clock, User } from "lucide-react";
import { getPublishedPost, listPublishedPosts } from "@/lib/blogPosts";
import BlogArticleBody from "@/components/blog/BlogArticleBody";

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
  return { title: post ? `${post.title} | iClosed` : "Blog not found | iClosed" };
}

export default async function DashboardBlogPost({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);

  if (!post) notFound();

  const related = (await listPublishedPosts())
    .filter((p) => p.slug !== post.slug)
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-[#fdfcfc]">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-[#C10007]"
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
          Back to Blog
        </Link>

        <article>
          <div className="relative mb-8 h-64 w-full overflow-hidden rounded-3xl sm:h-80">
            <Image
              src={post.image}
              alt={post.imageAlt}
              fill
              className="object-cover"
              priority
            />
          </div>

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

          <div className="mb-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-gray-100 pb-6 text-sm text-gray-400">
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
          </div>

          <BlogArticleBody html={post.content} />

          {post.faq.length > 0 && (
            <section className="mb-12">
              <h2 className="mb-6 border-l-[3px] border-[#C10007] pl-5 text-xl font-bold tracking-tight text-gray-900">
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
        </article>

        {related.length > 0 && (
          <section className="border-t border-gray-100 pt-10">
            <h2 className="mb-6 text-lg font-bold tracking-tight text-gray-900">
              Keep reading
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {related.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="group block">
                  <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white transition-all duration-300 hover:-translate-y-1 hover:border-red-100 hover:shadow-[0_16px_44px_rgba(193,0,7,0.09)]">
                    <div className="relative h-40 w-full shrink-0 overflow-hidden">
                      <Image src={p.image} alt={p.imageAlt} fill className="object-cover" />
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="mb-2 line-clamp-2 text-[15px] font-bold leading-snug text-gray-900 group-hover:text-[#C10007]">
                        {p.title}
                      </h3>
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-gray-500">
                        {p.excerpt}
                      </p>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
