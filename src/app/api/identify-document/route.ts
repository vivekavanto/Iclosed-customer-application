import { NextResponse } from "next/server";

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
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
  return `You are a strict document classifier helping verify a Canadian real-estate client's identification.

Look at the uploaded document image/PDF carefully. The image may contain MULTIPLE different ID documents (e.g., a PDF with both a driver's license and passport scanned together).

For EACH distinct identification document you find in the image/PDF:

1. Is it a real government-issued identification document? (Reject blank pages, screenshots of websites, contracts, photos of people, random documents, etc.)
2. Classify it as one of these document types (use the EXACT label):
${ACCEPTABLE_IDS.map((d) => `   - ${d}`).join("\n")}
3. Determine which side(s) of that specific ID are visible:
   - "front" if only the front side is shown
   - "back" if only the back side is shown
   - "front-and-back" if BOTH front AND back sides of that same ID are visible (e.g., both sides of a driver's license scanned together)
   - "unknown" if you cannot determine
4. Decide required side rule for that ID type:
   - "single-sided" (one side is sufficient, e.g., passport info page)
   - "front-and-back" (both sides needed, e.g., driver's license)
   - "unknown" (cannot determine)

Edge-case policy:
- Passports are "single-sided" (info page only needed).
- Cards (Driver's License, PR Card, etc.) are "front-and-back" required.
- IMPORTANT: Users often scan/photograph BOTH sides of an ID onto one page. Look for TWO distinct views of the same card. If you see both sides of one ID together, that single document entry should have side="front-and-back".
- IMPORTANT: Users may scan MULTIPLE DIFFERENT IDs into one file (e.g., driver's license + passport in same PDF). Create a separate entry in the documents array for EACH distinct ID type found.
- If a PDF has multiple pages, examine all pages for IDs.

Respond with ONLY a valid JSON object (no markdown, no code fences, no commentary) matching this exact shape:

{
  "contains_identification": boolean,
  "documents": [
    {
      "document_type": string,
      "side": "front" | "back" | "front-and-back" | "unknown",
      "side_requirement": "single-sided" | "front-and-back" | "unknown",
      "is_complete": boolean,
      "confidence": "high" | "medium" | "low"
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

If "contains_identification" is false, return an empty documents array and explain in "reason" what the document appears to be.`;
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

interface DocumentEntry {
  document_type: string;
  side: Side;
  side_requirement: SideRequirement;
  is_complete: boolean;
  confidence: Confidence;
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
    const documents: DocumentEntry[] = parsed.documents
      .filter((d) => 
        typeof d?.document_type === "string" && d.document_type.trim().length > 0
      )
      .map((d) => d as { document_type: string; side?: unknown; side_requirement?: unknown; is_complete?: unknown; confidence?: unknown })
      .map((d) => ({
        document_type: d.document_type.trim(),
        side: parseSide(d.side),
        side_requirement: parseSideRequirement(d.side_requirement),
        is_complete: Boolean(d.is_complete),
        confidence: parseConfidence(d.confidence),
      }));

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
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      // Include full multi-document data
      multiple_documents: documents.length > 0 ? documents : undefined,
      summary: documents.length > 0 ? summary : undefined,
    };
  }

  // Fallback: handle legacy single-document format (shouldn't happen with new prompt)
  const legacyParsed = parsed as unknown as Partial<IdentificationResult>;
  return {
    is_identification: Boolean(legacyParsed.is_identification),
    document_type:
      typeof legacyParsed.document_type === "string" && legacyParsed.document_type.trim().length > 0
        ? legacyParsed.document_type.trim()
        : null,
    side: parseSide(legacyParsed.side),
    side_requirement: parseSideRequirement(legacyParsed.side_requirement),
    confidence: parseConfidence(legacyParsed.confidence),
    reason: typeof legacyParsed.reason === "string" ? legacyParsed.reason : "",
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
    const timeoutId = setTimeout(() => controller.abort(), 25_000);

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
          ? "Gemini request timed out after 25s."
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
      console.log(
        `[identify-document] Detected: type="${result.document_type}" side="${result.side}" confidence="${result.confidence}"`,
      );
    }
    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[identify-document] error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
