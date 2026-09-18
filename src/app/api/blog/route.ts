import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { listAllPosts, createPost, type BlogPostWrite } from "@/lib/blogPosts";

/**
 * GET  /api/blog — every post, any status. Admin list.
 * POST /api/blog — create a draft.
 *
 * Lives at /api/blog rather than /api/admin/blog on purpose: /api/admin/* is
 * gated by the shared ADMIN_SERVICE_KEY header, which a browser could only
 * satisfy by shipping that secret to every visitor, and next.config.ts serves
 * that prefix with a wildcard CORS header. See src/lib/requireAdmin.ts.
 */
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const posts = await listAllPosts();
  return NextResponse.json({ success: true, posts });
}

/** Fields a client is allowed to set. Anything else in the body is ignored. */
const WRITABLE = [
  "slug", "status", "published_at",
  "title", "excerpt", "content_html", "content_source", "reading_time_min",
  "cover_image_url", "cover_image_alt", "author", "tags",
  "meta_title", "meta_description", "canonical_url", "og_image_url",
  "focus_keyword", "faq", "noindex", "seo_source", "format_source",
  "formatted_at", "format_model",
] as const;

export function pickWritable(input: Record<string, unknown>): BlogPostWrite {
  const out: Record<string, unknown> = {};
  for (const key of WRITABLE) {
    if (key in input && input[key] !== undefined) out[key] = input[key];
  }
  return out as BlogPostWrite;
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  // A new post is always a draft, whatever the caller asked for. Publishing is
  // a separate, deliberate call to /api/blog/[id]/publish — there is no path
  // that creates live content in one step.
  const fields = { ...pickWritable(payload), status: "draft" as const };

  const result = await createPost(fields, auth.admin.email);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, post: result.row }, { status: 201 });
}
