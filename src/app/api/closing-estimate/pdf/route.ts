import { NextResponse } from "next/server";
import {
  parseFileId,
  resolveClientEstimateContext,
} from "@/lib/clientEstimateContext";
import { isBlobUrl, isPrivateBlobUrl, blobTokenForUrl } from "@/lib/blobPrivacy";
import { estimatePdfFileName } from "@/lib/closingEstimateEmail";

// GET /api/closing-estimate/pdf
//
// Streams the statement PDF the ADMIN app generated and stored on the issued
// estimate. Deliberately a proxy rather than a regeneration: the client must
// receive the byte-identical artifact the firm produced and stands behind, not
// a fresh render that could differ if a letterhead or a font changed.
//
// This is the ONLY path by which the firm's own document reaches the client, so
// it resolves the estimate through the same context every other closing-cost
// route uses — otherwise the file this streams from and the file the modal
// displays could drift apart for a client with more than one deal.
//
// Ownership comes from the session — the caller supplies no id and no URL, so
// there is nothing to tamper with, and the blob URL itself is never exposed to
// the browser.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const fileId = parseFileId(new URL(req.url).searchParams.get("file_id"));
  if (fileId !== null && typeof fileId !== "string") {
    return NextResponse.json(
      { success: false, error: fileId.error },
      { status: 404 },
    );
  }

  const resolved = await resolveClientEstimateContext(fileId);
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error },
      { status: resolved.status },
    );
  }
  const ctx = resolved.context;

  const pdfUrl = (ctx.issued?.pdf_url as string | null) ?? null;
  if (!pdfUrl) {
    return NextResponse.json(
      { success: false, error: "Your statement is not ready to download yet." },
      { status: 404 },
    );
  }

  // SSRF guard: this fetch carries a privileged token, so it must only ever be
  // pointed at Vercel Blob.
  if (!isBlobUrl(pdfUrl)) {
    return NextResponse.json(
      { success: false, error: "Stored statement is unavailable." },
      { status: 502 },
    );
  }

  const fileName = estimatePdfFileName({
    fileNo: ctx.locked.fileNo,
    propertyAddress: ctx.locked.propertyAddress,
  });

  try {
    const upstream = await fetch(pdfUrl, {
      headers: isPrivateBlobUrl(pdfUrl)
        ? { Authorization: `Bearer ${blobTokenForUrl(pdfUrl)}` }
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
