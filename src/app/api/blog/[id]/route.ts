import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { getPostById, updatePost, deletePost } from "@/lib/blogPosts";
import { pickWritable } from "../route";

/**
 * GET / PATCH / DELETE a single post.
 */
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const post = await getPostById(id);
  if (!post) {
    return NextResponse.json({ success: false, error: "Post not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true, post });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const before = await getPostById(id);
  if (!before) {
    return NextResponse.json({ success: false, error: "Post not found." }, { status: 404 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  // `status` is not editable here — /api/blog/[id]/publish owns that transition
  // so that going live always runs through one code path with one revalidation.
  const fields = pickWritable(payload);
  delete (fields as Record<string, unknown>).status;

  const result = await updatePost(id, fields, auth.admin.email);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  // Editing an already-live post has to reach readers without a deploy. Both
  // slugs when it moved, or the old URL keeps serving the old copy from cache.
  if (before.status !== "draft") {
    revalidatePath("/blogs");
    revalidatePath(`/blogs/${before.slug}`);
    if (result.row.slug !== before.slug) revalidatePath(`/blogs/${result.row.slug}`);
  }

  return NextResponse.json({ success: true, post: result.row });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const before = await getPostById(id);
  if (!before) {
    return NextResponse.json({ success: false, error: "Post not found." }, { status: 404 });
  }

  const result = await deletePost(id);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  if (before.status !== "draft") {
    revalidatePath("/blogs");
    revalidatePath(`/blogs/${before.slug}`);
  }

  return NextResponse.json({ success: true });
}
