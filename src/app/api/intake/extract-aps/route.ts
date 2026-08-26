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

import { NextResponse } from "next/server";
import { readBlobDocument, BlobDocumentError } from "@/lib/blobDocument";
import { parseApsExtraction, type ApsSide } from "@/lib/apsExtraction";

// A full OREA agreement is six to ten pages of dense form text with handwritten
// inserts and schedules attached — materially harder than the single-page ID
// photo /api/identify-document classifies, so this runs a full flash tier
// rather than the flash-lite that route uses.
//
// Pinned to a specific version on purpose. A moving alias (gemini-flash-latest)
// would silently change how a legal document is read between deploys, and this
// output prefills a client's price, deposit and closing date.
//
// Verify a change with:
//   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Reading a real agreement is SLOW — an OREA form with amendments is ~700 KB
// and 20+ pages, and measured round-trips on one run at 3.9s (flash-lite),
// 16.9s (3.5-flash) and 25.6s (3.6-flash). The original 45s ceiling sat close
// enough to that spread that a longer document tripped it. Nothing is waiting
// on this — extraction runs in the background while the client fills the form
// in — so the ceiling is set well clear of the measured range instead.
const GEMINI_TIMEOUT_MS = 60_000;
const GEMINI_MAX_ATTEMPTS = 2;
const GEMINI_RETRY_DELAY_MS = 1_200;
// Don't start a second attempt unless it can finish inside maxDuration below.
const GEMINI_RETRY_CUTOFF_MS = 45_000;

// Vercel kills a function at its plan default (as low as 10s) unless the route
// says otherwise, which would cut a read off long before the timeout above ever
// fired — a failure that would only appear once deployed. Bounds the worst case
// at roughly 45s (attempt 1) + 1.2s + 60s (attempt 2) = ~107s.
export const maxDuration = 130;
// Buffer and the Blob SDK need the Node runtime, not Edge. Set explicitly, as
// the other blob-reading routes in this repo do.
export const runtime = "nodejs";

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

// ── Rate limiting ─────────────────────────────────────────────
// In-memory and therefore per-instance — a coarse abuse brake, not a quota.
// It costs nothing and stops a single client hammering the model endpoint in a
// loop; anything stricter belongs at the edge.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_CALLS = 12;
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

// ── Prompt ────────────────────────────────────────────────────

function buildPrompt(side: ApsSide): string {
  const sideNote =
    side === "sale"
      ? `This agreement is for a property the client is SELLING. The client is on the SELLER side.`
      : `This agreement is for a property the client is BUYING. The client is on the BUYER side.`;

  return `You are extracting structured data from an Ontario real-estate Agreement of Purchase and Sale (APS) — typically an OREA Form 100 (resale) or Form 101 (condominium), possibly with amendments, waivers and schedules attached.

${sideNote}

Extract ONLY what is actually written on the document. Never infer, estimate, or fill a plausible-looking value. A missing field must come back as null. A wrong value that looks right is far worse than a blank one, because the client may not catch it.

============================================================
WHAT TO EXTRACT
============================================================

1. purchase_price — the total purchase/sale price stated in the agreement.
   - Digits only, no currency symbol, no thousands separators: "1250000", not "$1,250,000.00".
   - This is the PRICE, not the deposit, not the balance due on closing.

2. deposit — the deposit amount held under the agreement.
   - Same digits-only format.
   - If several deposits are listed (initial plus increase), return their TOTAL.

3. closing_date — the completion / closing date.
   - Strictly "YYYY-MM-DD". Convert any written form ("the 15th day of March, 2026") to that format.
   - This is the COMPLETION date, not the offer date, not the irrevocable date, not the requisition date.

4. property_address — the address of the property being bought or sold.
   - Split into components. "street" is the street number and name only ("123 Main Street West").
   - "unit" is the unit / suite / apartment number alone, if there is one.
   - "postal_code" in "A1A 1A1" form if present.

5. buyers — every BUYER named on the agreement, as full names.
6. sellers — every SELLER named on the agreement, as full names.
   - Names exactly as written, one entry per person. Do NOT split a single
     person's name across entries, and do not include corporate suffixes as
     separate people.
   - If the seller is a corporation or estate, return it as a single entry.

7. agents — the real-estate agents / brokerages named on the agreement.
   - "full_name" is the individual salesperson, if named. "brokerage" is the firm.
   - "role" is "listing" for the seller's brokerage, "cooperating" for the buyer's
     brokerage, "unknown" if you cannot tell which is which.
   - Include email and phone ONLY if they are printed on the document.

============================================================
CONFIDENCE
============================================================
Each extracted value carries a confidence:
   - "high"   — the value is clearly printed and unambiguous
   - "medium" — legible but handwritten, amended, or you had to choose between candidates
   - "low"    — barely legible, inferred from context, or possibly superseded by an amendment

If an amendment changes a value (price, closing date), return the AMENDED value and mark it "medium" unless the amendment is unambiguous.

============================================================
NOT AN APS
============================================================
If this document is not an Agreement of Purchase and Sale — a listing agreement, a mortgage commitment, a status certificate, an ID, a random photo — set "is_aps": false, return nulls and empty arrays throughout, and say what the document actually appears to be in "reason".

Respond with ONLY a valid JSON object (no markdown, no code fences, no commentary) matching this exact shape:

{
  "is_aps": boolean,
  "purchase_price": { "value": string | null, "confidence": "high" | "medium" | "low" },
  "deposit":        { "value": string | null, "confidence": "high" | "medium" | "low" },
  "closing_date":   { "value": string | null, "confidence": "high" | "medium" | "low" },
  "property_address": {
    "street": string | null,
    "unit": string | null,
    "city": string | null,
    "province": string | null,
    "postal_code": string | null,
    "confidence": "high" | "medium" | "low"
  },
  "buyers":  [{ "full_name": string }],
  "sellers": [{ "full_name": string }],
  "agents":  [{
    "full_name": string | null,
    "brokerage": string | null,
    "role": "listing" | "cooperating" | "unknown",
    "email": string | null,
    "phone": string | null
  }],
  "reason": string
}`;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

// ── Handler ───────────────────────────────────────────────────

export async function POST(req: Request) {
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

    if (!SUPPORTED_MIME_TYPES.has(mimeType.toLowerCase())) {
      return NextResponse.json(
        {
          success: false,
          error: `We can't read ${mimeType} files. Upload a PDF or an image of the agreement.`,
        },
        { status: 415 },
      );
    }

    console.log(
      `[extract-aps] Reading side="${side}" file="${fileName}" mime="${mimeType}" size=${bytes.byteLength}B model="${GEMINI_MODEL}"`,
    );

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(side) },
            { inline_data: { mime_type: mimeType, data: bytes.toString("base64") } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    };

    // The flash tiers return 503 UNAVAILABLE under load often enough that a
    // single-shot call would surface a transient spike to the client as "we
    // couldn't read it". One retry costs a second and recovers most of them;
    // beyond that, the form falls back to manual entry, which always works.
    let res: Response | null = null;
    let json: GeminiResponse = {};
    const startedAt = Date.now();

    for (let attempt = 0; attempt < GEMINI_MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

      try {
        res = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const aborted = err instanceof Error && err.name === "AbortError";
        console.error(
          `[extract-aps] fetch error (attempt ${attempt + 1}):`,
          err instanceof Error ? err.message : err,
        );
        // A timeout means the document is slow to read, not that the service is
        // flaky — retrying just burns another 45 seconds of the client's time.
        if (aborted) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Reading your agreement took too long. You can enter the details yourself.",
            },
            { status: 504 },
          );
        }
        if (attempt < GEMINI_MAX_ATTEMPTS - 1) continue;
        return NextResponse.json(
          {
            success: false,
            error: "We couldn't read your agreement just now. You can enter the details yourself.",
          },
          { status: 504 },
        );
      }
      clearTimeout(timeoutId);

      json = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (res.ok) break;

      // The upstream message can carry key/quota detail — log it, don't return it.
      console.error(
        `[extract-aps] Gemini ${res.status} (attempt ${attempt + 1}): ${json?.error?.message ?? "unknown"}`,
      );

      // 429/5xx are worth a second try; a 400 or 404 is a bug in our request
      // and will fail identically however many times we send it. And only if
      // there's time left for the retry to actually complete.
      const retriable = res.status === 429 || res.status >= 500;
      const timeLeft = Date.now() - startedAt < GEMINI_RETRY_CUTOFF_MS;
      if (!retriable || !timeLeft || attempt === GEMINI_MAX_ATTEMPTS - 1) {
        return NextResponse.json(
          {
            success: false,
            error: "We couldn't read your agreement just now. You can enter the details yourself.",
          },
          { status: 502 },
        );
      }

      await new Promise((resolve) => setTimeout(resolve, GEMINI_RETRY_DELAY_MS));
    }

    if (!res || !res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "We couldn't read your agreement just now. You can enter the details yourself.",
        },
        { status: 502 },
      );
    }

    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) {
      console.error("[extract-aps] Empty response text from Gemini");
      return NextResponse.json(
        {
          success: false,
          error: "We couldn't read your agreement just now. You can enter the details yourself.",
        },
        { status: 502 },
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(stripCodeFences(text));
    } catch {
      console.error("[extract-aps] Could not parse model JSON");
      return NextResponse.json(
        {
          success: false,
          error: "We couldn't read your agreement just now. You can enter the details yourself.",
        },
        { status: 502 },
      );
    }

    // parseApsExtraction never throws — a partial or malformed payload degrades
    // to a result with nothing in it, which the form treats as "couldn't read".
    const result = parseApsExtraction(raw);

    console.log(
      `[extract-aps] side="${side}" is_aps=${result.is_aps} price=${result.purchase_price.value ?? "-"} deposit=${result.deposit.value ?? "-"} closing=${result.closing_date.value ?? "-"} buyers=${result.buyers.length} sellers=${result.sellers.length} agents=${result.agents.length}`,
    );

    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    console.error(
      "[extract-aps] error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      {
        success: false,
        error: "We couldn't read your agreement just now. You can enter the details yourself.",
      },
      { status: 500 },
    );
  }
}
