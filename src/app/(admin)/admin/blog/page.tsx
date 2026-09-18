import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { listAllPosts } from "@/lib/blogPosts";

export const dynamic = "force-dynamic";

export default async function AdminBlogList() {
  const posts = await listAllPosts();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Posts</h1>
          <p className="mt-1 text-sm text-gray-500">
            {posts.length} {posts.length === 1 ? "post" : "posts"}
          </p>
        </div>
        <Link
          href="/admin/blog/new"
          className="inline-flex items-center gap-2 rounded-full bg-[#C10007] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
        >
          <Plus size={15} strokeWidth={2.5} />
          New post
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center">
          <p className="text-base font-semibold text-gray-900">No posts yet</p>
          <p className="mt-2 text-sm text-gray-500">
            Create one, paste the article text, and let AI handle the formatting.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/admin/blog/${post.id}`}
              className="flex flex-wrap items-center gap-3 border-b border-gray-50 px-5 py-4 transition last:border-b-0 hover:bg-gray-50/70"
            >
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                  post.status === "published"
                    ? "border border-green-100 bg-green-50 text-green-700"
                    : "border border-gray-200 bg-gray-50 text-gray-500"
                }`}
              >
                {post.status}
              </span>

              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                {post.title}
              </span>

              {/* An unedited machine draft is the one thing worth surfacing in a
                  list view: it is the post most likely to need a lawyer's eye
                  before it goes anywhere near a reader. */}
              {post.format_source === "gemini" && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                  <Sparkles size={10} />
                  Unreviewed
                </span>
              )}

              <span className="shrink-0 text-xs text-gray-400">
                {new Date(post.updated_at).toLocaleDateString("en-CA", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
