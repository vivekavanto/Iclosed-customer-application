import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { BrowserTools } from "./browser.js";
import { nextTurn, type Content, type FunctionDeclaration, type Part } from "./gemini.js";
import type { Requirement } from "./requirements.js";

export type Status = "PASS" | "PARTIAL" | "FAIL" | "NOT_IMPLEMENTED" | "BLOCKED";

export type Verdict = {
  status: Status;
  summary: string;
  criteria: { criterion: string; status: "met" | "not_met" | "missing" | "untested"; note: string }[];
  steps: string[];
  screenshot?: string;
  error?: string;
};

const ref = { type: "string", description: "Element ref from the snapshot, e.g. e12" };

const TOOLS: FunctionDeclaration[] = [
  { name: "navigate", description: "Open a path on the app (e.g. /login).", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "click", description: "Click an element.", parameters: { type: "object", properties: { ref }, required: ["ref"] } },
  { name: "type", description: "Replace a field's value with text; optionally press Enter after.", parameters: { type: "object", properties: { ref, text: { type: "string" }, submit: { type: "boolean" } }, required: ["ref", "text"] } },
  { name: "select_option", description: "Choose an option in a <select> by its label or value.", parameters: { type: "object", properties: { ref, value: { type: "string" } }, required: ["ref", "value"] } },
  { name: "set_checked", description: "Check or uncheck a checkbox/radio.", parameters: { type: "object", properties: { ref, checked: { type: "boolean" } }, required: ["ref", "checked"] } },
  { name: "upload_file", description: "Attach a file from the fixtures folder to a file input.", parameters: { type: "object", properties: { ref, fixture: { type: "string" } }, required: ["ref", "fixture"] } },
  { name: "press_key", description: "Press a keyboard key, e.g. Enter, Escape, Tab.", parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } },
  { name: "scroll", description: "Scroll the page.", parameters: { type: "object", properties: { direction: { type: "string", enum: ["up", "down"] } }, required: ["direction"] } },
  { name: "wait", description: "Wait up to 10 seconds for something async, then re-snapshot.", parameters: { type: "object", properties: { seconds: { type: "number" } }, required: ["seconds"] } },
  { name: "go_back", description: "Browser back button." },
  { name: "snapshot", description: "Re-read the current page." },
  { name: "screenshot", description: "Look at the page visually (layout, images, colours)." },
  {
    name: "report_verdict",
    description: "Finish this requirement with a verdict. Call exactly once, when you have enough evidence.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["PASS", "PARTIAL", "FAIL", "NOT_IMPLEMENTED", "BLOCKED"] },
        summary: { type: "string", description: "One or two sentences a developer can act on." },
        criteria: {
          type: "array",
          items: {
            type: "object",
            properties: {
              criterion: { type: "string" },
              status: { type: "string", enum: ["met", "not_met", "missing", "untested"] },
              note: { type: "string" },
            },
            required: ["criterion", "status", "note"],
          },
        },
      },
      required: ["status", "summary", "criteria"],
    },
  },
];

function systemPrompt(baseUrl: string, credentials: string) {
  const fixtures = (() => {
    try {
      return readdirSync(new URL("../fixtures/", import.meta.url)).filter((f) => !f.startsWith("."));
    } catch {
      return [];
    }
  })();
  return `You are a QA engineer testing a web app at ${baseUrl} against one written requirement.

Work like a careful manual tester:
- Break the requirement into concrete, checkable acceptance criteria.
- Drive the app with the tools. Every action returns a fresh snapshot: interactive elements tagged [eN] plus visible text, URL and any console/HTTP errors.
- Use refs only from the most recent snapshot. Use screenshot only when layout or visuals matter.
- If an action leaves the page unchanged, don't repeat it: take a screenshot and try something different (e.g. a required choice you missed).
- Verify outcomes from what the app actually shows, never assume.
- Do not perform irreversible real-world actions (paying, sending real emails to real people, deleting data) unless the requirement explicitly asks for it. Use obviously fake test data (e.g. "Test User", test+e2e@example.com).
- Stay on ${baseUrl}.

Then call report_verdict with one status:
- PASS: every criterion works.
- PARTIAL: the feature exists but some criteria are not met or missing.
- FAIL: the feature exists but is broken (errors, wrong result, crash, 500s).
- NOT_IMPLEMENTED: no sign of the feature anywhere reasonable (no page, button, field or text for it).
- BLOCKED: you could not test it (login failed, needs data that isn't there, or you couldn't work out how to operate the UI and the app showed no error). Say what is needed.
Per criterion: met / not_met (exists, wrong) / missing (not built) / untested.
Each criterion note must cite the evidence you observed (exact message text, URL, value), not a restatement of the criterion.
${credentials}
Fixture files available for uploads: ${fixtures.join(", ") || "(none)"}.`;
}

export async function testRequirement(opts: {
  page: Page;
  req: Requirement;
  baseUrl: string;
  maxSteps: number;
  credentials: string;
  screenshotPath: string;
  log: (line: string) => void;
}): Promise<Verdict> {
  const { page, req, log } = opts;
  const browser = new BrowserTools(page, opts.baseUrl, new URL("../fixtures/", import.meta.url).pathname);
  const steps: string[] = [];
  const contents: Content[] = [];

  const finish = async (v: Omit<Verdict, "steps" | "screenshot">): Promise<Verdict> => {
    await browser.screenshot(opts.screenshotPath);
    return { ...v, steps, screenshot: opts.screenshotPath };
  };

  try {
    const first = await browser.navigate(req.start);
    contents.push({
      role: "user",
      parts: [
        {
          text: `Requirement ${req.id}: ${req.title}\n${req.section ? `Section: ${req.section}\n` : ""}\n${req.body || req.title}\n\nYou are on ${req.start}${req.auth ? " (signed in as the test user)" : ""}.\n\n${first.text}`,
        },
        ...(await referenceImages(req.images, log)),
      ],
    });

    for (let step = 0; step < opts.maxSteps; step++) {
      const reply = await nextTurn({ system: systemPrompt(opts.baseUrl, opts.credentials), contents, tools: TOOLS });
      contents.push(reply);

      const calls = reply.parts.filter((p) => p.functionCall);
      if (!calls.length) {
        contents.push({ role: "user", parts: [{ text: "Use a tool, or call report_verdict." }] });
        continue;
      }

      const responses: Part[] = [];
      const images: Part[] = [];
      for (const { functionCall: call } of calls) {
        const args = call!.args ?? {};
        if (call!.name === "report_verdict") {
          log(`  ✓ verdict ${args.status}`);
          return finish({
            status: args.status as Status,
            summary: String(args.summary ?? ""),
            criteria: (args.criteria as Verdict["criteria"]) ?? [],
          });
        }
        const line = `${call!.name} ${JSON.stringify(args)}`;
        steps.push(line);
        log(`  → ${line}`);
        const result = await browser.run(call!.name, args);
        responses.push({ functionResponse: { name: call!.name, id: call!.id, response: { result: result.text } } });
        if (result.image) images.push({ inlineData: { mimeType: "image/png", data: result.image.toString("base64") } });
      }

      pruneOldObservations(contents);
      contents.push({ role: "user", parts: [...responses, ...images] });
    }
    return finish({ status: "BLOCKED", summary: `Ran out of steps (${opts.maxSteps}) before reaching a verdict.`, criteria: [] });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return finish({ status: "BLOCKED", summary: "Tester crashed before reaching a verdict.", criteria: [], error });
  }
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function referenceImages(sources: string[], log: (line: string) => void): Promise<Part[]> {
  const parts: Part[] = [];
  for (const src of sources) {
    try {
      let data: Buffer;
      let mimeType: string | undefined;
      if (/^https?:\/\//i.test(src)) {
        const res = await fetch(src, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = Buffer.from(await res.arrayBuffer());
        mimeType = res.headers.get("content-type")?.split(";")[0];
      } else {
        data = readFileSync(src);
      }
      mimeType = mimeType?.startsWith("image/") ? mimeType : MIME[path.extname(new URL(src, "file:///").pathname).toLowerCase()];
      if (!mimeType) throw new Error("unsupported image type");
      if (data.length > MAX_IMAGE_BYTES) throw new Error("larger than 4 MB");
      parts.push({ inlineData: { mimeType, data: data.toString("base64") } });
    } catch (err) {
      log(`  ! skipped image ${src.slice(0, 80)}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (parts.length) {
    parts.unshift({ text: `${parts.length} reference image(s) from the requirement follow: mockups or screenshots of the expected result. Compare the app against them where the requirement refers to them.` });
  }
  return parts;
}

function pruneOldObservations(contents: Content[]) {
  for (const c of contents.slice(1)) {
    if (c.role !== "user") continue;
    c.parts = c.parts.filter((p) => !p.inlineData);
    for (const p of c.parts) {
      const r = p.functionResponse?.response;
      if (r && typeof r.result === "string" && r.result.length > 400) {
        r.result = r.result.slice(0, 200) + " …(older snapshot omitted)";
      }
    }
  }
}
