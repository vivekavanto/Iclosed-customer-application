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
import {
  parseApsPayload,
  type ApsExtractionResult,
  type ApsSide,
} from "@/lib/apsExtraction";

// ── Models ────────────────────────────────────────────────────
// Reads were failing on the model, not on the document — a 700 KB agreement
// failed exactly like a 7.5 MB one. Measured against the same twelve-page PDF
// on our own key, gemini-3.5-flash returned in 7.6s, 10s and 94s on three runs,
// answered "503 high demand" on several more, and — the part that actually
// broke us — took 47 to 115 SECONDS to deliver that 503. A single-model call
// behind one timeout could not survive that no matter how the timeout was set.
//
// So the read walks a ladder instead. Quality first: the strongest tier gets
// the first look, and an ordinary read never sees the rest. Any failure — slow,
// overloaded, rate-limited, malformed — hands the same document straight to the
// next model rather than giving up, and the last rung is the flash-lite tier
// that answered the identical prompt in ~2s on every attempt. In practice that
// makes "we couldn't read it" require every tier to fail at once.
//
// Re-measure before reordering, and verify a new id exists first with:
//   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
const MODEL_LADDER = [
  { id: "gemini-3.5-flash", timeoutMs: 55_000 },
  { id: "gemini-3.6-flash", timeoutMs: 45_000 },
  { id: "gemini-3.1-flash-lite", timeoutMs: 40_000 },
] as const;

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// NOTE: do not add generationConfig.thinkingConfig here. Capping the thinking
// budget looks like an obvious latency win, but the tiers on this ladder don't
// agree on it — gemini-3.6-flash and the flash-lite tiers answer
// `thinkingBudget: 0` with "400 Request contains an invalid argument", which
// would take out the fallback rungs and leave nothing to fall back TO. The
// ladder is what buys the latency instead.

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

/** Hard wall for the whole ladder, comfortably inside maxDuration. */
const TOTAL_BUDGET_MS = 165_000;
/** Never start a call that can't plausibly finish in the time left. */
const MIN_ATTEMPT_MS = 8_000;
/** Only for a connection that dropped — see the loop for why nothing else. */
const NETWORK_RETRY_DELAY_MS = 1_000;

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

// ── Prompt ────────────────────────────────────────────────────

function buildPrompt(side: ApsSide): string {
  const sideNote =
    side === "sale"
      ? `This agreement is for a property the client is SELLING. The client is on the SELLER side.`
      : `This agreement is for a property the client is BUYING. The client is on the BUYER side.`;

  return `You are extracting structured data from ONE FILE out of an Ontario real-estate agreement package — the Agreement of Purchase and Sale itself (typically an OREA Form 100 for resale or Form 101 for a condominium), or one of the amendments, waivers, notices and schedules that go with it.

${sideNote}

Extract ONLY what is actually written on THIS document. Never infer, estimate, or fill a plausible-looking value. A missing field must come back as null. A wrong value that looks right is far worse than a blank one, because the client may not catch it.

Each file the client uploads is read separately and the results are merged
afterwards, with amendments layered over the agreement. So:
  - Report what THIS file says, and nothing else.
  - Do NOT leave a field blank because you think another file covers it.
  - Do NOT carry a value over from what a file you were not given might say.

ONE FILE, ONE ANSWER. The file may be a single form, or it may be a whole
package scanned into one PDF — an offer summary, then the agreement, then its
schedules, a confirmation of co-operation and a signing certificate, one after
another. Either way you are describing the FILE AS A WHOLE and you must return
exactly ONE JSON object. Never return an array, never return one object per
form, and never split your answer across several objects.

============================================================
WHICH DOCUMENT IS THIS?
============================================================
Set "document_type" to one of:
   - "aps"       — the Agreement of Purchase and Sale itself
   - "amendment" — an Amendment to the Agreement of Purchase and Sale
                   (OREA Form 120), or any document that changes an agreed
                   term: price, deposit, closing/completion date, or the
                   parties. A "Confirmation of Amendment" counts.
   - "schedule"  — Schedule A/B/etc. attached to the agreement
   - "waiver"    — a waiver or notice of fulfilment of condition (Form 123/124)
   - "other"     — anything else that is still part of this package

Judge the file by the most important thing in it. If an Agreement of Purchase
and Sale appears ANYWHERE in the file, the file is "aps" — read the agreement's
values and treat the cover sheets, schedules and signing certificates bound in
with it as part of that same agreement, not as separate documents competing for
the label. Only when there is no agreement in the file do the other types
apply.

An amendment, schedule or waiver IS part of the agreement package: set
"is_aps": true for it. Reserve "is_aps": false for a document that has nothing
to do with this transaction — a mortgage commitment, a status certificate, an
ID, a random photo.

============================================================
HAND-CORRECTED VALUES
============================================================
These documents are negotiated on paper. A term that was typed or printed on
the form is very often struck out by hand and the agreed value written in
beside, above or below it — usually in a different hand or colour, and usually
with the parties' initials somewhere near it.

THE HANDWRITTEN CORRECTION IS THE AGREED VALUE. The struck-out value is what
the term USED to say, and is never the answer.

So, before reading any field, look at the whole area around it, not just the
line the label points at:
  - A number with a line, a strike, an X or a scribble through it has been
    REPLACED. Find what replaced it — normally immediately above the
    struck-out number, or squeezed into the margin beside it — and use that.
  - Handwriting beats print wherever the two conflict, even when the
    handwriting is messier or harder to read than the printed value it
    replaces. Do not prefer the printed value because it is cleaner.
  - Initials near an edit confirm it was agreed. They do not change which
    value is current; the un-struck one is current either way.
  - If a value has been corrected more than once, the last surviving
    (un-struck) value is the answer.
  - Only if you genuinely cannot make out the replacement should you fall back
    to the struck-out value — and then set that field's confidence to "low".

A field read off a handwritten correction is "medium" confidence at best.

============================================================
WHAT TO EXTRACT
============================================================

1. purchase_price — the total purchase/sale price stated in the document.
   - Digits only, no currency symbol, no thousands separators: "1250000", not "$1,250,000.00".
   - This is the PRICE, not the deposit, not the balance due on closing.
   - On an OREA Form 100/101 it is in the opening paragraph, printed as
     "PURCHASE PRICE: Dollars CDN$ ______" with the amount ALSO written out in
     words on the line above or below ("Eight Hundred Seventy Thousand").
     Read both. If the figures are handwritten, struck through or hard to make
     out, take the amount from the words — an amount written in words is still
     the amount, and a null here means the client has to type it in themselves.
   - On an amendment it is whatever new price the amendment states.

2. deposit — the deposit amount held under the document.
   - Same digits-only format.
   - On an OREA Form 100/101 it is the "DEPOSIT" paragraph: "Buyer submits ...
     $______", again usually with the amount in words as well. Same rule —
     if the figures are unclear, use the words.
   - If several deposits are listed (initial plus increase), return their TOTAL.

3. closing_date — the completion / closing date.
   - Strictly "YYYY-MM-DD". Convert any written form ("the 15th day of March, 2026") to that format.
   - This is the COMPLETION date, not the offer date, not the irrevocable date, not the requisition date.
   - On an OREA Form 100/101 it is the "COMPLETION DATE" paragraph: "... shall
     be completed by no later than 6:00 p.m. on the ____ day of ________,
     20__", with the day, the month and the two-digit year each on their own
     blank. Read all three, and take the year off the document rather than
     assuming the current one.
   - THE DAY NUMBER IS THE FIELD MOST OFTEN CORRECTED BY HAND. A printed day
     with a line through it and a handwritten day above or beside it means the
     closing date MOVED: return the handwritten day, not the struck-out one.
     The same goes for the month and the year. See HAND-CORRECTED VALUES above
     — a closing date lifted from a crossed-out number is the most expensive
     mistake you can make on this form, because the whole file is scheduled
     around it.
   - Beware the adjacent IRREVOCABILITY paragraph, which carries its own
     day / month / year blanks and its own hand-corrections. Take the date from
     the COMPLETION DATE paragraph only.

4. property_address — the address of the property being bought or sold.
   - Split into components. "street" is the street number and name only ("123 Main Street West").
   - "unit" is the unit / suite / apartment number alone, if there is one.
   - "postal_code" in "A1A 1A1" form if present.

5. buyers — every BUYER named on this document, as full names.
6. sellers — every SELLER named on this document, as full names.
   - IN THE ORDER THEY APPEAR ON THE DOCUMENT. The first buyer listed is the
     first entry in "buyers". This order is used to decide who the primary
     contact on the file is, so do not re-order or alphabetize.
   - Names exactly as written, one entry per person. Do NOT split a single
     person's name across entries, and do not include corporate suffixes as
     separate people.
   - If the seller is a corporation or estate, return it as a single entry.
   - On an AMENDMENT that adds a party, list the party it adds. On one that
     only re-states the existing parties in its header, list those. Either way,
     report the names printed on this document — the merge downstream takes
     care of combining them with the agreement's.
   - Witnesses, agents, brokers, lawyers and lenders are NOT buyers or sellers.

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

Confidence records how sure you are; it does not decide whether to answer. If you can read a value, return it — a value you were only "medium" about is still far more use to the client than a null they have to replace by hand.

============================================================
NOT PART OF THIS TRANSACTION
============================================================
If this document has nothing to do with the purchase or sale — a listing agreement, a mortgage commitment, a status certificate, an ID, a random photo — set "is_aps": false, "document_type": "other", return nulls and empty arrays throughout, and say what the document actually appears to be in "reason".

Respond with ONLY ONE valid JSON object (no markdown, no code fences, no commentary, and not an array) matching this exact shape:

{
  "is_aps": boolean,
  "document_type": "aps" | "amendment" | "schedule" | "waiver" | "other",
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

// ── Response shape ────────────────────────────────────────────
// responseMimeType alone only promises valid JSON — it says nothing about the
// SHAPE of it, and the rungs disagree about what shape to pick. Asked to read a
// PDF with five OREA forms stapled together, gemini-3.1-flash-lite answers with
// an ARRAY of per-form objects about half the time. Downstream that used to
// read as "this is not an Agreement of Purchase and Sale", which is the worst
// possible failure here: the client is told their agreement is the wrong
// document and asked to type every field in by hand, and nothing anywhere logs
// an error, because every layer believes the read succeeded.
//
// The schema is what stops that at the source; parseApsPayload() is the belt to
// its braces, and the "unusable" outcome below means a model that still answers
// with something unrecognizable costs us the next rung, not the client's trust.
//
// VERIFY BEFORE EDITING: every rung on MODEL_LADDER must accept this. Unlike
// generationConfig.thinkingConfig — see the note above — responseSchema is
// accepted by all three today, but the ladder is only as strong as its weakest
// rung, so re-check with a real agreement after any change here.
const NULLABLE_STRING = { type: "STRING", nullable: true } as const;
const CONFIDENCE_SCHEMA = {
  type: "STRING",
  enum: ["high", "medium", "low"],
} as const;
const VALUE_SCHEMA = {
  type: "OBJECT",
  properties: { value: NULLABLE_STRING, confidence: CONFIDENCE_SCHEMA },
  required: ["value", "confidence"],
} as const;
const PARTY_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: { full_name: { type: "STRING" } },
    required: ["full_name"],
  },
} as const;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_aps: { type: "BOOLEAN" },
    document_type: {
      type: "STRING",
      enum: ["aps", "amendment", "schedule", "waiver", "other"],
    },
    purchase_price: VALUE_SCHEMA,
    deposit: VALUE_SCHEMA,
    closing_date: VALUE_SCHEMA,
    property_address: {
      type: "OBJECT",
      properties: {
        street: NULLABLE_STRING,
        unit: NULLABLE_STRING,
        city: NULLABLE_STRING,
        province: NULLABLE_STRING,
        postal_code: NULLABLE_STRING,
        confidence: CONFIDENCE_SCHEMA,
      },
      required: [
        "street",
        "unit",
        "city",
        "province",
        "postal_code",
        "confidence",
      ],
    },
    buyers: PARTY_SCHEMA,
    sellers: PARTY_SCHEMA,
    agents: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          full_name: NULLABLE_STRING,
          brokerage: NULLABLE_STRING,
          role: {
            type: "STRING",
            enum: ["listing", "cooperating", "unknown"],
          },
          email: NULLABLE_STRING,
          phone: NULLABLE_STRING,
        },
        required: ["full_name", "brokerage", "role", "email", "phone"],
      },
    },
    reason: NULLABLE_STRING,
  },
  required: [
    "is_aps",
    "document_type",
    "purchase_price",
    "deposit",
    "closing_date",
    "property_address",
    "buyers",
    "sellers",
    "agents",
  ],
} as const;

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

// ── One model call ────────────────────────────────────────────

type ReadOutcome =
  | { kind: "ok"; result: ApsExtractionResult }
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "upstream"; status: number }
  /** Answered, but with nothing we could parse. */
  | { kind: "unusable" };

async function readWithModel(
  apiKey: string,
  model: string,
  side: ApsSide,
  bytes: Buffer,
  mimeType: string,
  timeoutMs: number,
): Promise<ReadOutcome> {
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
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${endpointFor(model)}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.error(
      `[extract-aps] ${model}: fetch ${aborted ? "timed out" : "failed"}:`,
      err instanceof Error ? err.message : err,
    );
    return aborted ? { kind: "timeout" } : { kind: "network" };
  } finally {
    clearTimeout(timeoutId);
  }

  const json = (await res.json().catch(() => ({}))) as GeminiResponse;

  if (!res.ok) {
    // The upstream message can carry key/quota detail — log it, don't return it.
    console.error(
      `[extract-aps] ${model}: ${res.status} — ${json?.error?.message ?? "unknown"}`,
    );
    return { kind: "upstream", status: res.status };
  }

  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    console.error(`[extract-aps] ${model}: empty response text`);
    return { kind: "unusable" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stripCodeFences(text));
  } catch {
    console.error(`[extract-aps] ${model}: could not parse model JSON`);
    return { kind: "unusable" };
  }

  // parseApsPayload() finds the extraction whatever wrapper the model put it
  // in, and answers null only when there is no extraction in there at all.
  // That case is a broken ANSWER, not a rejected document, so it goes back as
  // "unusable" and the ladder tries the next model — reporting it as
  // is_aps:false would tell the client their agreement is the wrong file.
  const result = parseApsPayload(raw);
  if (!result) {
    console.error(
      `[extract-aps] ${model}: no extraction object in model JSON (` +
        `${Array.isArray(raw) ? "array" : typeof raw})`,
    );
    return { kind: "unusable" };
  }

  return { kind: "ok", result };
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

    const deadline = startedAt + TOTAL_BUDGET_MS;
    let attempts = 0;
    let sawTimeout = false;

    for (const model of MODEL_LADDER) {
      const timeLeft = deadline - Date.now();
      if (timeLeft < MIN_ATTEMPT_MS) {
        console.error(`[extract-aps] out of budget before ${model.id}`);
        break;
      }

      attempts++;
      let outcome = await readWithModel(
        apiKey,
        model.id,
        side,
        bytes,
        mimeType,
        Math.min(model.timeoutMs, timeLeft),
      );

      // A dropped connection is the one failure where the SAME model deserves
      // an immediate second look — nothing reached it, so nothing about it is
      // known to be wrong. Every other failure (slow, overloaded, rate-limited,
      // 400, unparsable) is a verdict on this model right now, and the next
      // rung is a better use of the budget than asking it again.
      if (outcome.kind === "network" && deadline - Date.now() > MIN_ATTEMPT_MS) {
        await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
        attempts++;
        outcome = await readWithModel(
          apiKey,
          model.id,
          side,
          bytes,
          mimeType,
          Math.min(model.timeoutMs, deadline - Date.now()),
        );
      }

      if (outcome.kind === "ok") {
        const result = outcome.result;
        console.log(
          `[extract-aps] side="${side}" model="${model.id}" attempts=${attempts} ` +
            `ms=${Date.now() - startedAt} is_aps=${result.is_aps} ` +
            `doc_type=${result.document_type} ` +
            `price=${result.purchase_price.value ?? "-"} deposit=${result.deposit.value ?? "-"} ` +
            `closing=${result.closing_date.value ?? "-"} buyers=${result.buyers.length} ` +
            `sellers=${result.sellers.length} agents=${result.agents.length}`,
        );
        return NextResponse.json({ success: true, result });
      }

      if (outcome.kind === "timeout") sawTimeout = true;
    }

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
