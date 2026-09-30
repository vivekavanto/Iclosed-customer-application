"use client";

import { useState } from "react";
import { ArrowRight, Calendar } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { BlogPost } from "@/lib/blogPosts";
import BlogCoverImage from "@/components/blog/BlogCoverImage";

const INITIAL_CARD_COUNT = 6;
const CARD_ROW_SIZE = 3;

export default function DashboardBlogCards({
  posts,
  basePath = "/blog",
}: {
  posts: BlogPost[];
  basePath?: string;
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_CARD_COUNT);
  const visiblePosts = posts.slice(0, visibleCount);
  const hasMorePosts = visibleCount < posts.length;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-7">
        {visiblePosts.map((post) => (
          <Link key={post.id} href={`${basePath}/${post.slug}`} className="group block h-full">
            <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.06)] transition-all duration-300 ease-out hover:-translate-y-2 hover:border-red-100 hover:shadow-[0_20px_56px_rgba(193,0,7,0.10)]">
              <BlogCoverImage src={post.image} alt={post.imageAlt} sizes="(min-width: 640px) 50vw, 100vw" className="h-48 w-full shrink-0" />
              <div className="flex flex-1 flex-col p-6">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-gray-400">{post.readTime}</span>
                </div>
                <h3 className="mb-3 line-clamp-2 text-[15px] font-bold leading-snug text-gray-900 transition-colors duration-200 group-hover:text-[#C10007]">{post.title}</h3>
                <p className="mb-5 line-clamp-3 flex-1 text-[13px] leading-relaxed text-gray-500">{post.excerpt}</p>
                <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                    <Calendar size={12} strokeWidth={2} />
                    <span>{post.date}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#C10007] transition-all duration-200 group-hover:gap-2.5">
                    Read more <ArrowRight size={13} strokeWidth={2.5} />
                  </span>
                </div>
              </div>
            </article>
          </Link>
        ))}
      </div>

      {hasMorePosts && (
        <div className="mt-20 flex justify-center">
          <Button
            type="button"
            size="lg"
            onClick={() => setVisibleCount((count) => count + CARD_ROW_SIZE)}
            className="px-14 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            Load More Articles
          </Button>
        </div>
      )}
    </>
  );
}
