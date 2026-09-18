import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { formatBlogHtml } from "@/lib/blogFormat";
import { rateLimitOk } from "@/lib/rateLimit";

/**
 * POST /api/blog/format — raw text in, structured article HTML out.
 *
 * Stateless: it formats and returns, and writes nothing. Saving is a separate,
 * explicit call to PATCH /api/blog/[id], so an admin always sees the markup
 * before it becomes the stored copy of a post.
 */

// sanitize-html needs Node, not Edge — as every other route here does.
export const runtime = "nodejs";

// The model ladder budgets 50s worst case (30 + 20). Well inside this, with
// room to serialize; without it the platform default could cut a format off
// mid-flight and return a gateway HTML 504 the editor cannot parse.
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // Keyed per admin, not per IP: this spends money on a third-party API, and a
  // loop bug in a bulk import is a realistic way to burn the Gemini quota.
  const allowed = await rateLimitOk(`blog-format:${auth.admin.email}`, 40, 60);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Too many formatting requests. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let payload: { body?: unknown; title?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const body = typeof payload.body === "string" ? payload.body : "";
  const title = typeof payload.title === "string" ? payload.title : undefined;

  if (!body.trim()) {
    return NextResponse.json(
      { success: false, error: "Paste the article text first." },
      { status: 400 },
    );
  }

  const result = await formatBlogHtml({ body, title });
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    html: result.data.html,
    warnings: result.data.warnings,
    model: result.data.model,
    wordsPreserved: result.data.wordsPreserved,
  });
}
