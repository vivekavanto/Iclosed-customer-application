import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isNotionUrl, loadNotionPage } from "./notion.js";

export type Requirement = {
  id: string;
  title: string;
  section: string;
  start: string;
  auth: boolean;
  body: string;
  images: string[];
};

const DIRECTIVE = /^(start|auth|image):\s*(.+)$/i;
const ID_PREFIX = /^([A-Z][A-Z0-9]*-\d+)[\s:.\-–]+(.*)$/;
const MD_IMAGE = /!\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g;

// `##` is a section; each `###` is a requirement.
export function parseMarkdown(md: string, baseDir: string): Requirement[] {
  const reqs: Requirement[] = [];
  let section = "";
  let current: Requirement | null = null;

  for (const line of md.split(/\r?\n/)) {
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      if (current) reqs.push(current);
      current = newRequirement(h3[1].trim(), section, reqs.length + 1);
      continue;
    }
    if (h2) {
      if (current) reqs.push(current);
      current = null;
      section = h2[1].trim();
      continue;
    }
    if (current) addLine(current, line, baseDir);
  }
  if (current) reqs.push(current);

  for (const r of reqs) r.body = r.body.trim();
  return reqs;
}

export function fromText(text: string, id: string, title: string, section: string, baseDir: string): Requirement {
  const req = newRequirement(title, section, 0);
  req.id = id;
  for (const line of text.split(/\r?\n/)) addLine(req, line, baseDir);
  req.body = req.body.trim();
  return req;
}

export async function loadRequirements(inputs: string[]): Promise<Requirement[]> {
  const reqs: Requirement[] = [];
  let promptCount = 0;
  for (const input of inputs) {
    if (/\.md$/i.test(input) && existsSync(input)) {
      reqs.push(...parseMarkdown(readFileSync(input, "utf8"), path.dirname(path.resolve(input))));
    } else if (isNotionUrl(input)) {
      const page = await loadNotionPage(input);
      reqs.push(fromText(page.markdown, page.id, page.title, "Notion", process.cwd()));
    } else {
      const n = ++promptCount;
      reqs.push(fromText(input, `PROMPT-${n}`, input.split(/\r?\n/)[0].slice(0, 80), "Ad-hoc", process.cwd()));
    }
  }
  return reqs;
}

function addLine(req: Requirement, line: string, baseDir: string) {
  const d = line.trim().match(DIRECTIVE);
  if (d) return applyDirective(req, d[1], d[2], baseDir);
  for (const m of line.matchAll(MD_IMAGE)) req.images.push(resolveImage(m[1], baseDir));
  req.body += line + "\n";
}

function resolveImage(src: string, baseDir: string) {
  return /^https?:\/\//i.test(src) ? src : path.resolve(baseDir, decodeURIComponent(src));
}

function newRequirement(heading: string, section: string, n: number): Requirement {
  const m = heading.match(ID_PREFIX);
  return {
    id: m ? m[1] : `R${n}`,
    title: m ? m[2].trim() : heading,
    section,
    start: "/",
    auth: false,
    body: "",
    images: [],
  };
}

function applyDirective(req: Requirement, key: string, value: string, baseDir: string) {
  const k = key.toLowerCase();
  if (k === "start") req.start = value.trim();
  else if (k === "image") req.images.push(resolveImage(value.trim(), baseDir));
  else req.auth = /^(yes|true|required|client)$/i.test(value.trim());
}
