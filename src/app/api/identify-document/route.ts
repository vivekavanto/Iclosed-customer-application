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

Look at the uploaded document image/PDF and decide:

1. Is this a real government-issued identification document? (Reject blank pages, screenshots of websites, contracts, photos of people, random documents, etc.)
2. If yes, classify it as one of these document types (use the EXACT label):
${ACCEPTABLE_IDS.map((d) => `   - ${d}`).join("\n")}
3. If you can tell, indicate which side is shown: "front", "back", or "unknown".
4. Decide required side rule for this ID as:
   - "single-sided" (one side is sufficient to validate this ID type),
   - "front-and-back" (both sides should be collected),
   - "unknown" (cannot determine).
5. Provide a confidence level: "high", "medium", or "low".

Edge-case policy to apply:
- Passports are usually single-sided for upload requirements (booklet info page). Treat as "single-sided" unless there is clear evidence both sides are required.
- If the document is a card and important identification data typically appears on both sides, return "front-and-back".
- If uncertain, use "unknown" and explain in reason.

Respond with ONLY a valid JSON object (no markdown, no code fences, no commentary) matching this exact shape:

{
  "is_identification": boolean,
  "document_type": string | null,
  "side": "front" | "back" | "unknown",
  "side_requirement": "single-sided" | "front-and-back" | "unknown",
  "confidence": "high" | "medium" | "low",
  "reason": string
}

If "is_identification" is false, set "document_type" to null and explain briefly in "reason" what the document appears to be.`;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

interface IdentificationResult {
  is_identification: boolean;
  document_type: string | null;
  side: "front" | "back" | "unknown";
  side_requirement: "single-sided" | "front-and-back" | "unknown";
  confidence: "high" | "medium" | "low";
  reason: string;
}

function parseGeminiJson(text: string): IdentificationResult {
  // Strip optional ```json ... ``` fences just in case the model adds them
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Partial<IdentificationResult>;

  return {
    is_identification: Boolean(parsed.is_identification),
    document_type:
      typeof parsed.document_type === "string" && parsed.document_type.trim().length > 0
        ? parsed.document_type.trim()
        : null,
    side: parsed.side === "front" || parsed.side === "back" ? parsed.side : "unknown",
    side_requirement:
      parsed.side_requirement === "single-sided" || parsed.side_requirement === "front-and-back"
        ? parsed.side_requirement
        : "unknown",
    confidence:
      parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
        ? parsed.confidence
        : "low",
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
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

    console.log(
      `[identify-document] Detected: type="${result.document_type}" side="${result.side}" confidence="${result.confidence}"`,
    );
    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[identify-document] error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
