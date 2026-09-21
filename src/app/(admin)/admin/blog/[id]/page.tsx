import { notFound } from "next/navigation";
import { getPostById } from "@/lib/blogPosts";
import BlogEditor, { type EditorPost } from "@/components/blog/BlogEditor";

export const dynamic = "force-dynamic";

export default async function EditBlogPost({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getPostById(id);
  if (!row) notFound();

  // The editor's inputs are all controlled, so every nullable column has to
  // arrive as a string — a null here turns the field into an uncontrolled
  // input and React warns on the first keystroke.
  const initial: EditorPost = {
    id: row.id,
    slug: row.slug,
    status: row.status,
    title: row.title,
    excerpt: row.excerpt ?? "",
    content_html: row.content_html ?? "",
    content_source: row.content_source ?? "",
    cover_image_url: row.cover_image_url ?? "",
    cover_image_alt: row.cover_image_alt ?? "",
    author: row.author,
    tags: row.tags ?? [],
    meta_title: row.meta_title ?? "",
    meta_description: row.meta_description ?? "",
    focus_keyword: row.focus_keyword ?? "",
    faq: Array.isArray(row.faq) ? row.faq : [],
    noindex: row.noindex,
    format_source: row.format_source,
    seo_source: row.seo_source,
  };

  return <BlogEditor initial={initial} />;
}
