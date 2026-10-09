export type Part = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
  thoughtSignature?: string;
};
export type Content = { role: "user" | "model"; parts: Part[] };
export type FunctionDeclaration = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
};

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export const MODELS = (process.env.E2E_MODELS ?? "gemini-3.5-flash,gemini-3.1-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const exhausted = new Set<string>();

// ANY forces a tool call every turn.
export async function nextTurn(opts: {
  system: string;
  contents: Content[];
  tools: FunctionDeclaration[];
}): Promise<Content> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set (checked e2e-agent/.env and ../.env.local).");

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    tools: [{ functionDeclarations: opts.tools }],
    toolConfig: { functionCallingConfig: { mode: "ANY" } },
  });

  const failures: string[] = [];
  for (const model of MODELS) {
    if (exhausted.has(model)) continue;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: AbortSignal.timeout(90_000),
      }).catch((e: Error) => e);

      if (res instanceof Error) {
        failures.push(`${model}: ${res.message}`);
        continue;
      }
      if (res.status === 429) {
        const detail = await res.text();
        if (/quota/i.test(detail)) {
          exhausted.add(model);
          console.warn(`  ! ${model} is out of quota; using the next model for the rest of this run`);
          failures.push(`${model}: quota exceeded`);
          break;
        }
      }
      if (res.status === 429 || res.status >= 500) {
        failures.push(`${model}: HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        failures.push(`${model}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
        break;
      }
      const json = (await res.json()) as { candidates?: { content?: Content }[] };
      const content = json.candidates?.[0]?.content;
      if (content?.parts?.length) return { role: "model", parts: content.parts };
      failures.push(`${model}: empty response`);
    }
  }
  throw new Error(`Gemini failed: ${failures.join(" | ")}`);
}
