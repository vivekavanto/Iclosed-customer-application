import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeals } from "@/lib/getAuthClient";
import { isBlobUrl, isPrivateBlobUrl, blobTokenForUrl } from "@/lib/blobPrivacy";

// GET /api/closing-estimate/pdf
//
// Streams the statement PDF the ADMIN app generated and stored on the issued
// estimate. Deliberately a proxy rather than a regeneration: the client must
// receive the byte-identical artifact the firm produced and stands behind, not
// a fresh render that could differ if a letterhead or a font changed.
//
// Ownership comes from the session — the caller supplies no id and no URL, so
// there is nothing to tamper with, and the blob URL itself is never exposed to
// the browser.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthClientDeals();
  if (!auth?.client) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  const dealIds = (auth.deals ?? []).map((d) => d.id);
  if (dealIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "No file found for your account." },
      { status: 404 },
    );
  }

  const { data: rows } = await supabaseAdmin
    .from("deal_closing_estimates")
    .select("id, pdf_url, file_no_display")
    .in("deal_id", dealIds)
    .eq("status", "issued")
    .eq("is_deleted", false)
    .order("issued_at", { ascending: false })
    .limit(1);

  const row = rows?.[0] ?? null;
  if (!row?.pdf_url) {
    return NextResponse.json(
      {
        success: false,
        error: "Your statement is not ready to download yet.",
      },
      { status: 404 },
    );
  }

  // SSRF guard: this fetch carries a privileged token, so it must only ever be
  // pointed at Vercel Blob.
  if (!isBlobUrl(row.pdf_url)) {
    return NextResponse.json(
      { success: false, error: "Stored statement is unavailable." },
      { status: 502 },
    );
  }

  const suffix = String(row.file_no_display ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "");
  const fileName = suffix
    ? `estimated-closing-costs-${suffix}.pdf`
    : "estimated-closing-costs.pdf";

  try {
    const upstream = await fetch(row.pdf_url, {
      headers: isPrivateBlobUrl(row.pdf_url)
        ? { Authorization: `Bearer ${blobTokenForUrl(row.pdf_url)}` }
        : undefined,
      cache: "no-store",
    });
    if (!upstream.ok) {
      console.error("[closing-estimate pdf] blob fetch failed:", upstream.status);
      return NextResponse.json(
        { success: false, error: "Could not open your statement. Please try again." },
        { status: 502 },
      );
    }

    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[closing-estimate pdf] proxy error:", err);
    return NextResponse.json(
      { success: false, error: "Could not open your statement. Please try again." },
      { status: 502 },
    );
  }
}
