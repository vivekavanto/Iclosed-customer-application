import BlogEditor, { EMPTY_POST } from "@/components/blog/BlogEditor";

export const dynamic = "force-dynamic";

export default function NewBlogPost() {
  return <BlogEditor initial={EMPTY_POST} />;
}
