import { NextResponse } from "next/server";

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const ACCEPTABLE_IDS = [
  "Canadian Passport",
  "Driver's License",
  "Canadian Citizenship Card",
  "Permanent Resident Card",
  "NEXUS Card",
  "SIN Card (plastic only)",
  "Foreign Passport",
  "Government-issued Photo ID Card",
];

// Documents that look official but are NOT acceptable under LSO By-Law 7.1.
// Used both in the prompt (to steer the model) and as a server-side safety net
// to reject anything the model still misclassifies.
const REJECTED_ID_KEYWORDS = [
  "health card",
  "ohip",
  "ramq",
  "msp",
  "bc services card",
  "medical card",
  "insurance card",
  "library card",
  "student",
  "school id",
  "employee",
  "work id",
  "membership",
  "loyalty",
  "credit card",
  "debit card",
  "bank card",
  "transit",
  "metro",
  "presto",
  "social insurance number slip",
  "sin paper",
  "birth certificate",
  "marriage certificate",
];

const ACCEPTABLE_IDS_NORMALIZED = new Set(
  ACCEPTABLE_IDS.map((s) => s.toLowerCase()),
);

function isAcceptableIdType(documentType: string): boolean {
  const normalized = documentType.trim().toLowerCase();
  if (!normalized) return false;
  // Hard reject anything that contains a rejected keyword, even if the model
  // tries to label it as something else (e.g. "Government-issued Photo ID Card
  // (Health Card)").
  for (const bad of REJECTED_ID_KEYWORDS) {
    if (normalized.includes(bad)) return false;
  }
  return ACCEPTABLE_IDS_NORMALIZED.has(normalized);
}

const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

function buildPrompt() {
  return `You are a STRICT document classifier helping verify a Canadian real-estate client's identification under Law Society of Ontario By-Law 7.1.

Your job is to decide whether the uploaded image/PDF contains ACCEPTABLE government-issued identification. Be conservative — when in doubt, REJECT.

============================================================
ACCEPTABLE document types (these are the ONLY valid types):
${ACCEPTABLE_IDS.map((d) => `   - ${d}`).join("\n")}
============================================================

============================================================
EXPLICITLY REJECTED documents — these must NEVER be classified as identification, even if they look official, are government-issued, or contain a photo. If the upload is one of these (or only contains these), set "contains_identification": false and return an empty "documents" array:
   - Health Cards of any kind (Ontario OHIP / red-and-white or photo, Quebec RAMQ, BC Services Card, Alberta AHCIP, any provincial/territorial health insurance card, any private medical/insurance card)
   - Birth certificates, marriage certificates, death certificates
   - Paper SIN slips or SIN confirmation letters (only the plastic SIN card is acceptable, and even then it must clearly be the plastic card)
   - Library cards, student IDs, school IDs, employee/work IDs, gym/membership cards, loyalty cards
   - Credit cards, debit cards, bank cards
   - Transit cards (Presto, OPUS, Compass, etc.)
   - Vehicle ownership / vehicle registration / vehicle insurance pink slips
   - Utility bills, bank statements, tax documents, letters
   - Screenshots of websites, selfies, random photos of people, contracts, blank pages
   - Expired IDs that are clearly past their expiry date
============================================================

For EACH distinct identification document you find in the image/PDF, do the following:

1. Verify it is a real, physical, government-issued identification document that matches EXACTLY one of the ACCEPTABLE types above. If you cannot confidently map it to one of those exact labels, treat it as NOT identification.
2. Use the EXACT label from the ACCEPTABLE list as "document_type" (verbatim, including punctuation and capitalization). Do not invent new labels and do not append parentheticals.
3. Determine which side(s) of that specific ID are visible:
   - "front" if only the front side is shown
   - "back" if only the back side is shown
   - "front-and-back" if BOTH front AND back sides of that same ID are visible (e.g., both sides of a driver's license scanned together)
   - "unknown" if you cannot determine
4. Decide required side rule for that ID type:
   - "single-sided" (one side is sufficient, e.g., passport info page)
   - "front-and-back" (both sides needed, e.g., driver's license)
   - "unknown" (cannot determine)
5. Extract the EXPIRY DATE if visible on the document:
   - Look for "EXP", "EXPIRY", "EXPIRES", "VALID UNTIL", "DATE D'EXPIRATION", or similar labels
   - Return the date in YYYY-MM-DD format (e.g., "2025-08-15")
   - If the expiry date is not visible or cannot be read, return null
   - Note: SIN cards and some older IDs may not have expiry dates — return null in those cases

Edge-case policy:
- Passports (Canadian or Foreign) are "single-sided" (info / photo page only needed). If you see the BACK of a passport (the plain page with no photo), still classify it as a "Canadian Passport" or "Foreign Passport" with side="back" and side_requirement="single-sided". The back is not required but should still be recognized as part of a valid passport if submitted.
- Cards (Driver's License, PR Card, Citizenship Card, NEXUS, plastic SIN, generic Government-issued Photo ID Card) are "front-and-back" required.
- DRIVER'S LICENSE BACK SIDE DETECTION: The back of a driver's license is VALID identification and must be recognized. Driver's license backs typically contain: a 2D barcode (PDF417), magnetic stripe, additional text/numbers, and sometimes a signature. If you see any of these elements along with a card format, classify it as "Driver's License" with side="back". Do NOT reject driver's license backs as invalid.
- "Government-issued Photo ID Card" is a LAST-RESORT label only for legitimate provincial/territorial photo ID cards issued in lieu of a driver's license (e.g. Ontario Photo Card, BC Identification Card). Do NOT use this label to smuggle in health cards, work IDs, or any rejected document above.
- Users often scan/photograph BOTH sides of an ID onto one page. Look for TWO distinct views of the same card. If you see both sides of one ID together, that single document entry should have side="front-and-back".
- Users may scan MULTIPLE DIFFERENT IDs into one file (e.g., driver's license + passport in same PDF). Create a separate entry in the documents array for EACH distinct ACCEPTABLE ID type found. Ignore any rejected documents that appear alongside them.
- If a PDF has multiple pages, examine all pages for IDs.
- If the document is clearly a health card (contains words like "Health", "Santé", "OHIP", "RAMQ", "Health Insurance", a red/white Ontario health card design, a provincial health ministry logo, etc.), set "contains_identification": false and state in "reason" that health cards are not acceptable per LSO By-Law 7.1.

Respond with ONLY a valid JSON object (no markdown, no code fences, no commentary) matching this exact shape:

{
  "contains_identification": boolean,
  "documents": [
    {
      "document_type": string,
      "side": "front" | "back" | "front-and-back" | "unknown",
      "side_requirement": "single-sided" | "front-and-back" | "unknown",
      "is_complete": boolean,
      "confidence": "high" | "medium" | "low",
      "expiry_date": string | null
    }
  ],
  "summary": {
    "total_documents": number,
    "complete_documents": number,
    "document_types_found": string[]
  },
  "reason": string
}

Rules for "is_complete":
- true if side_requirement is "single-sided" OR if side is "front-and-back"
- true if side_requirement is "front-and-back" AND side is "front-and-back"
- false if side_requirement is "front-and-back" but only "front" or "back" is shown

If "contains_identification" is false, return an empty documents array and explain in "reason" exactly what the document appears to be (e.g. "Ontario Health Card — not acceptable under LSO By-Law 7.1").`;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

type Side = "front" | "back" | "front-and-back" | "unknown";
type SideRequirement = "single-sided" | "front-and-back" | "unknown";
type Confidence = "high" | "medium" | "low";
type ExpiryStatus = "valid" | "expired" | "expiring_soon" | "unknown";

interface DocumentEntry {
  document_type: string;
  side: Side;
  side_requirement: SideRequirement;
  is_complete: boolean;
  confidence: Confidence;
  expiry_date: string | null;
  expiry_status: ExpiryStatus;
}

interface MultiDocumentResult {
  contains_identification: boolean;
  documents: DocumentEntry[];
  summary: {
    total_documents: number;
    complete_documents: number;
    document_types_found: string[];
  };
  reason: string;
}

// Legacy single-document result for backward compatibility with frontend
interface IdentificationResult {
  is_identification: boolean;
  document_type: string | null;
  side: Side;
  side_requirement: SideRequirement;
  confidence: Confidence;
  reason: string;
  expiry_date: string | null;
  expiry_status: ExpiryStatus;
  // New fields for multi-document support
  multiple_documents?: DocumentEntry[];
  summary?: {
    total_documents: number;
    complete_documents: number;
    document_types_found: string[];
  };
}

function parseSide(side: unknown): Side {
  if (side === "front" || side === "back" || side === "front-and-back") return side;
  return "unknown";
}

function parseSideRequirement(req: unknown): SideRequirement {
  if (req === "single-sided" || req === "front-and-back") return req;
  return "unknown";
}

function parseConfidence(conf: unknown): Confidence {
  if (conf === "high" || conf === "medium" || conf === "low") return conf;
  return "low";
}

// Parse expiry date from various formats and determine status
function parseExpiryDate(rawDate: unknown): { date: string | null; status: ExpiryStatus } {
  if (typeof rawDate !== "string" || !rawDate.trim()) {
    return { date: null, status: "unknown" };
  }

  const dateStr = rawDate.trim();
  
  // Try to parse the date - Gemini should return YYYY-MM-DD but handle variations
  let parsedDate: Date | null = null;
  
  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    parsedDate = new Date(dateStr + "T00:00:00");
  }
  // Try MM/DD/YYYY or DD/MM/YYYY - assume MM/DD/YYYY for North American IDs
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const parts = dateStr.split("/");
    parsedDate = new Date(`${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}T00:00:00`);
  }
  // Try Month DD, YYYY or DD Month YYYY
  else {
    parsedDate = new Date(dateStr);
  }

  if (!parsedDate || isNaN(parsedDate.getTime())) {
    return { date: dateStr, status: "unknown" };
  }

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Normalize to YYYY-MM-DD for consistent storage
  const normalizedDate = parsedDate.toISOString().split("T")[0];

  if (parsedDate < now) {
    return { date: normalizedDate, status: "expired" };
  } else if (parsedDate <= thirtyDaysFromNow) {
    return { date: normalizedDate, status: "expiring_soon" };
  } else {
    return { date: normalizedDate, status: "valid" };
  }
}

function parseGeminiJson(text: string): IdentificationResult {
  // Strip optional ```json ... ``` fences just in case the model adds them
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Partial<MultiDocumentResult>;

  // Handle new multi-document format
  if (typeof parsed.contains_identification === "boolean" && Array.isArray(parsed.documents)) {
    const rawDocuments: DocumentEntry[] = parsed.documents
      .filter((d) =>
        typeof d?.document_type === "string" && d.document_type.trim().length > 0
      )
      .map((d) => d as { document_type: string; side?: unknown; side_requirement?: unknown; is_complete?: unknown; confidence?: unknown; expiry_date?: unknown })
      .map((d) => {
        const expiry = parseExpiryDate(d.expiry_date);
        return {
          document_type: d.document_type.trim(),
          side: parseSide(d.side),
          side_requirement: parseSideRequirement(d.side_requirement),
          is_complete: Boolean(d.is_complete),
          confidence: parseConfidence(d.confidence),
          expiry_date: expiry.date,
          expiry_status: expiry.status,
        };
      });

    // Server-side safety net: drop any document whose type is not on the
    // acceptable list or matches a rejected keyword (e.g. Health Card,
    // library card, etc.). This prevents a misclassified Health Card from
    // being treated as valid identification even if the model slips up.
    const documents = rawDocuments.filter((d) => isAcceptableIdType(d.document_type));
    const rejectedDocuments = rawDocuments.filter((d) => !isAcceptableIdType(d.document_type));

    let reason = typeof parsed.reason === "string" ? parsed.reason : "";
    if (rejectedDocuments.length > 0 && documents.length === 0) {
      const rejectedTypes = [...new Set(rejectedDocuments.map((d) => d.document_type))].join(", ");
      reason = reason
        ? `${reason} (Rejected: ${rejectedTypes} is not an acceptable ID under LSO By-Law 7.1.)`
        : `${rejectedTypes} is not an acceptable government-issued ID under LSO By-Law 7.1.`;
    }

    const summary = {
      total_documents: documents.length,
      complete_documents: documents.filter(d => d.is_complete).length,
      document_types_found: [...new Set(documents.map(d => d.document_type))],
    };

    // For backward compatibility, use the first document as the primary result
    const primary = documents[0];

    return {
      is_identification: parsed.contains_identification && documents.length > 0,
      document_type: primary?.document_type ?? null,
      side: primary?.side ?? "unknown",
      side_requirement: primary?.side_requirement ?? "unknown",
      confidence: primary?.confidence ?? "low",
      reason,
      expiry_date: primary?.expiry_date ?? null,
      expiry_status: primary?.expiry_status ?? "unknown",
      multiple_documents: documents.length > 0 ? documents : undefined,
      summary: documents.length > 0 ? summary : undefined,
    };
  }

  // Fallback: handle legacy single-document format (shouldn't happen with new prompt)
  const legacyParsed = parsed as unknown as Partial<IdentificationResult>;
  const legacyType =
    typeof legacyParsed.document_type === "string" && legacyParsed.document_type.trim().length > 0
      ? legacyParsed.document_type.trim()
      : null;
  const legacyAcceptable = legacyType ? isAcceptableIdType(legacyType) : false;
  return {
    is_identification: Boolean(legacyParsed.is_identification) && legacyAcceptable,
    document_type: legacyAcceptable ? legacyType : null,
    side: parseSide(legacyParsed.side),
    side_requirement: parseSideRequirement(legacyParsed.side_requirement),
    confidence: parseConfidence(legacyParsed.confidence),
    reason:
      typeof legacyParsed.reason === "string"
        ? legacyAcceptable
          ? legacyParsed.reason
          : `${legacyParsed.reason} (Rejected: ${legacyType ?? "document"} is not an acceptable ID under LSO By-Law 7.1.)`
        : legacyAcceptable
          ? ""
          : `${legacyType ?? "Document"} is not an acceptable government-issued ID under LSO By-Law 7.1.`,
    expiry_date: null,
    expiry_status: "unknown",
  };
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[identify-document] GEMINI_API_KEY is not set in process.env");
      return NextResponse.json(
        { success: false, error: "GEMINI_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file provided." },
        { status: 400 },
      );
    }

    const mimeType = file.type || "application/octet-stream";
    if (!SUPPORTED_MIME_TYPES.has(mimeType.toLowerCase())) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type for identification: ${mimeType}. Supported: PDF, JPG, PNG, WEBP, HEIC.`,
        },
        { status: 415 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    console.log(
      `[identify-document] Calling Gemini model="${GEMINI_MODEL}" file="${file.name}" mime="${mimeType}" size=${arrayBuffer.byteLength}B`,
    );

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt() },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    };

    // Hard timeout so the request can never hang indefinitely.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45_000);

    let res: Response;
    try {
      res = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Document verification is taking longer than expected. Please try again with a clearer image or smaller file size."
          : err instanceof Error
            ? err.message
            : "Gemini request failed.";
      console.error("[identify-document] fetch error:", message);
      return NextResponse.json({ success: false, error: message }, { status: 504 });
    }
    clearTimeout(timeoutId);

    const json = (await res.json().catch(() => ({}))) as GeminiResponse;

    if (!res.ok) {
      const message = json?.error?.message ?? `Gemini request failed (${res.status})`;
      console.error(`[identify-document] Gemini ${res.status}: ${message}`);
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }

    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) {
      return NextResponse.json(
        { success: false, error: "No response text from Gemini." },
        { status: 502 },
      );
    }

    let result: IdentificationResult;
    try {
      result = parseGeminiJson(text);
    } catch {
      return NextResponse.json(
        { success: false, error: "Could not parse Gemini response.", raw: text },
        { status: 502 },
      );
    }

    if (result.multiple_documents && result.multiple_documents.length > 1) {
      console.log(
        `[identify-document] Detected ${result.multiple_documents.length} documents: ${result.summary?.document_types_found.join(", ")} (${result.summary?.complete_documents}/${result.summary?.total_documents} complete)`,
      );
    } else {
      const expiryInfo = result.expiry_date ? ` expiry="${result.expiry_date}" status="${result.expiry_status}"` : "";
      console.log(
        `[identify-document] Detected: type="${result.document_type}" side="${result.side}" confidence="${result.confidence}"${expiryInfo}`,
      );
    }
    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[identify-document] error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
