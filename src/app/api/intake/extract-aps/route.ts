// Read an uploaded Agreement of Purchase and Sale and return the fields the
// intake form can prefill from it.
//
// Shape is deliberately the same as /api/identify-document: the browser has
// already uploaded the file straight to Vercel Blob, so only the URL is posted
// here and the bytes are read back server-side through readBlobDocument() —
// which is also what keeps this working under the SEC-003 private-blob rollout,
// since it resolves the right store token per URL rather than assuming one.
//
// POST { file_url, side, file_name?, mime_type? }
//   -> { success: true, result: ApsExtractionResult }
//   -> { success: false, error }          (never a crash the form can't recover from)
//
// UNAUTHENTICATED BY DESIGN: /intake is a public page and the client has no
// account yet at step 2. That makes this a paid model endpoint anyone can POST
// to, so it is rate-limited per IP below and inherits the 10 MB / MIME-allowlist
// caps the upload token already enforces.
//
// The whole document is always sent. An earlier version trimmed long PDFs down
// to their first and last pages on the theory that page count drove the reads
// that timed out; measurement said otherwise (see MODEL_LADDER), and a legal
// document the client uploaded should be read in full.

import { NextResponse } from "next/server";
import { readBlobDocument, BlobDocumentError } from "@/lib/blobDocument";
import type { ApsSide } from "@/lib/apsExtraction";
import { readApsDocument, SUPPORTED_MIME_TYPES } from "@/lib/apsReader";

// ── Time budget ───────────────────────────────────────────────
// Vercel kills a function at its plan default (as low as 10s) unless the route
// says otherwise, which would cut a read off long before our own timeouts ever
// fired — a failure that only appears once deployed, and one that comes back as
// a gateway HTML 504 the form can't even parse. This is the one ceiling we
// can't remove: it's the platform's, not ours. Everything below is budgeted to
// finish inside it with room to serialize a response.
export const maxDuration = 180;
// Buffer and the Blob SDK need the Node runtime, not Edge. Set explicitly, as
// the other blob-reading routes in this repo do.
export const runtime = "nodejs";

// ── Rate limiting ─────────────────────────────────────────────
// In-memory and therefore per-instance — a coarse abuse brake, not a quota.
// It costs nothing and stops a single client hammering the model endpoint in a
// loop; anything stricter belongs at the edge.
//
// The allowance covers the form's own automatic re-reads: a client whose first
// pass fails spends several calls getting a result, and must not be throttled
// for the retries we ourselves asked the page to make.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_CALLS = 24;
const recentCalls = new Map<string, number[]>();

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  const calls = (recentCalls.get(key) ?? []).filter((t) => t > cutoff);
  if (calls.length >= RATE_LIMIT_MAX_CALLS) {
    recentCalls.set(key, calls);
    return true;
  }

  calls.push(now);
  recentCalls.set(key, calls);

  // Opportunistic sweep so an instance that lives a long time doesn't hold
  // every IP it has ever seen.
  if (recentCalls.size > 500) {
    for (const [k, v] of recentCalls) {
      if (v.every((t) => t <= cutoff)) recentCalls.delete(k);
    }
  }

  return false;
}

// ── Handler ───────────────────────────────────────────────────

/**
 * One line of copy for every read failure. The form works either way — the
 * client just types the details in — so this stays matter-of-fact and says the
 * file is still going with the submission, which is the thing they'd worry
 * about. `retryable` tells the page it may quietly go round again.
 */
const FALLBACK_MESSAGE =
  "We couldn't read your agreement automatically. You can enter the details yourself — your file is still saved with your submission.";

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const apiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[extract-aps] GEMINI_API_KEY is not set in process.env");
      return NextResponse.json(
        { success: false, error: "Document reading is not configured." },
        { status: 500 },
      );
    }

    if (isRateLimited(clientKey(req))) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many documents read in a short period. Please try again shortly.",
        },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const fileUrl = typeof body.file_url === "string" ? body.file_url : "";
    if (!fileUrl) {
      return NextResponse.json(
        { success: false, error: "No file_url provided." },
        { status: 400 },
      );
    }

    const side: ApsSide = body.side === "sale" ? "sale" : "purchase";

    // readBlobDocument() owns the SSRF guard (must be a Vercel Blob URL) and
    // the size cap, and picks the store token from the URL itself.
    let bytes: Buffer;
    let mimeType: string;
    let fileName: string;
    try {
      const doc = await readBlobDocument(fileUrl);
      bytes = doc.bytes;
      mimeType =
        doc.meta.contentType && doc.meta.contentType !== "application/octet-stream"
          ? doc.meta.contentType
          : typeof body.mime_type === "string" && body.mime_type
            ? body.mime_type
            : "application/octet-stream";
      fileName =
        typeof body.file_name === "string" && body.file_name
          ? body.file_name
          : doc.meta.pathname.split("/").pop() || "agreement";
    } catch (err: unknown) {
      if (err instanceof BlobDocumentError) {
        return NextResponse.json(
          { success: false, error: err.message },
          { status: err.status },
        );
      }
      throw err;
    }

    mimeType = mimeType.toLowerCase();

    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        {
          success: false,
          error: `We can't read ${mimeType} files. Upload a PDF or an image of the agreement.`,
        },
        { status: 415 },
      );
    }

    console.log(
      `[extract-aps] Reading side="${side}" file="${fileName}" mime="${mimeType}" size=${bytes.byteLength}B`,
    );

    const read = await readApsDocument({ apiKey, side, bytes, mimeType, startedAt });
    if (read.ok) {
      const result = read.result;
      console.log(
        `[extract-aps] side="${side}" model="${read.model}" attempts=${read.attempts} ` +
          `ms=${Date.now() - startedAt} is_aps=${result.is_aps} ` +
          `doc_type=${result.document_type} ` +
          `price=${result.purchase_price.value ?? "-"} deposit=${result.deposit.value ?? "-"} ` +
          `closing=${result.closing_date.value ?? "-"} buyers=${result.buyers.length} ` +
          `sellers=${result.sellers.length} agents=${result.agents.length}`,
      );
      return NextResponse.json({ success: true, result });
    }
    const { attempts, sawTimeout } = read;

    console.error(
      `[extract-aps] every model failed after ${attempts} attempt(s) in ${Date.now() - startedAt}ms ` +
        `(file="${fileName}" size=${bytes.byteLength}B)`,
    );

    return NextResponse.json(
      { success: false, error: FALLBACK_MESSAGE, retryable: true },
      { status: sawTimeout ? 504 : 502 },
    );
  } catch (err: unknown) {
    console.error(
      "[extract-aps] error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { success: false, error: FALLBACK_MESSAGE, retryable: true },
      { status: 500 },
    );
  }
}
