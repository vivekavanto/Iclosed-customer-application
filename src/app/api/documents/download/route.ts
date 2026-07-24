import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeals } from "@/lib/getAuthClient";
import { isBlobUrl, blobTokenForUrl } from "@/lib/blobPrivacy";

/**
 * GET /api/documents/download?u=<private-blob-url>
 *
 * Auth-gated, ownership-checked streaming proxy for PRIVATE document blobs
 * (SEC-003 / CMP-001).
 *
 * Unlike the admin app, the portal's existing document endpoints
 * (/api/lead-identification-docs, /api/task-responses) trust a caller-supplied
 * id and perform NO ownership check, so this proxy re-derives ownership itself:
 *
 *   1. Authenticate the customer from the Supabase session cookie
 *      (getAuthClientDeals → the client + their own, non-deleted deals).
 *   2. Expand to the whole household: every lead in the same family
 *      (leads.parent_lead_id) as any of the client's deals — this is how a
 *      co-purchaser/co-seller can see shared documents.
 *   3. Resolve which lead the requested blob belongs to (via lead_corporate_docs
 *      or task_responses → tasks.deal_id → deals.lead_id).
 *   4. Only stream the bytes if that lead is in the client's family set.
 *
 * The private blob URL is never usable by the browser on its own, so a leaked
 * URL no longer exposes the document — every access passes this check.
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u");
  if (!u) {
    return NextResponse.json({ error: "Missing 'u' parameter" }, { status: 400 });
  }

  // SSRF guard: this proxy fetches with a privileged blob token, so it must only
  // ever be pointed at Vercel Blob URLs.
  if (!isBlobUrl(u)) {
    return NextResponse.json({ error: "Not a Vercel Blob URL" }, { status: 400 });
  }

  // ── 1. Authenticate ──────────────────────────────────────────────────────
  const auth = await getAuthClientDeals();
  if (!auth?.client) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // ── 2. Build the family lead-id set the client is allowed to see ──────────
  const clientLeadIds = (auth.deals ?? [])
    .map((d) => d.lead_id)
    .filter((x): x is string => !!x);

  if (clientLeadIds.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Roots of the client's own leads (a family shares one root: the primary lead).
  const { data: ownLeads } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id")
    .in("id", clientLeadIds);

  const rootIds = Array.from(
    new Set((ownLeads ?? []).map((l) => l.parent_lead_id ?? l.id)),
  );
  if (rootIds.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Every lead in those families (root + children) = the allowed owners.
  const orFilter = rootIds
    .map((r) => `id.eq.${r},parent_lead_id.eq.${r}`)
    .join(",");
  const { data: familyLeads } = await supabaseAdmin
    .from("leads")
    .select("id")
    .or(orFilter);

  const allowedLeadIds = new Set(
    (familyLeads ?? []).map((l) => l.id as string),
  );

  // ── 3. Resolve which lead the requested blob belongs to ───────────────────
  const ownerLeadId = await resolveOwnerLeadId(u);
  if (!ownerLeadId) {
    // Unknown document — don't confirm/deny existence beyond "not found".
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // ── 4. Enforce ownership ──────────────────────────────────────────────────
  if (!allowedLeadIds.has(ownerLeadId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── 5. Stream the private bytes ──────────────────────────────────────────
  try {
    const result = await get(u, {
      access: "private",
      // Private blobs live in the private store — pick the token by the URL so
      // this keeps working even if the flag is later rolled back (SEC-003).
      token: blobTokenForUrl(u),
    });
    if (!result || !result.stream) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      result.blob?.contentType || "application/octet-stream",
    );
    if (result.blob?.size != null) {
      headers.set("Content-Length", String(result.blob.size));
    }
    headers.set("Cache-Control", "private, no-store");

    let filename = "document";
    try {
      filename =
        decodeURIComponent(new URL(u).pathname.split("/").pop() || "") ||
        "document";
    } catch {
      /* keep default */
    }
    headers.set(
      "Content-Disposition",
      `inline; filename="${filename.replace(/["\\]/g, "")}"`,
    );

    return new Response(result.stream as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    console.error("[documents/download] error:", err?.message || err);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}

/**
 * Find the lead a stored blob URL belongs to. Checks lead_corporate_docs first
 * (identification / retainer / corporate docs), then task_responses
 * (file-field answers) via tasks.deal_id → deals.lead_id. Returns null if the
 * URL isn't recorded anywhere.
 */
async function resolveOwnerLeadId(fileUrl: string): Promise<string | null> {
  const { data: corpDoc } = await supabaseAdmin
    .from("lead_corporate_docs")
    .select("lead_id")
    .eq("file_url", fileUrl)
    .limit(1)
    .maybeSingle();
  if (corpDoc?.lead_id) return corpDoc.lead_id;

  const { data: resp } = await supabaseAdmin
    .from("task_responses")
    .select("task_id")
    .eq("file_url", fileUrl)
    .limit(1)
    .maybeSingle();
  if (!resp?.task_id) return null;

  const { data: task } = await supabaseAdmin
    .from("tasks")
    .select("deal_id")
    .eq("id", resp.task_id)
    .maybeSingle();
  if (!task?.deal_id) return null;

  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select("lead_id")
    .eq("id", task.deal_id)
    .maybeSingle();

  return deal?.lead_id ?? null;
}
