import { writeFileSync } from "node:fs";
import path from "node:path";
import type { Status, Verdict } from "./agent.js";
import type { Requirement } from "./requirements.js";

export type Result = { req: Requirement; verdict: Verdict; seconds: number };

const ORDER: Status[] = ["FAIL", "PARTIAL", "NOT_IMPLEMENTED", "BLOCKED", "PASS"];
const LABEL: Record<Status, string> = {
  PASS: "Done",
  PARTIAL: "Partially done",
  FAIL: "Failing",
  NOT_IMPLEMENTED: "Needs to be implemented",
  BLOCKED: "Could not test",
};
const ICON: Record<Status, string> = { PASS: "✅", PARTIAL: "🟡", FAIL: "❌", NOT_IMPLEMENTED: "🚧", BLOCKED: "⛔" };
const CRIT: Record<string, string> = { met: "✅", not_met: "❌", missing: "🚧", untested: "⚪" };

export function counts(results: Result[]) {
  return ORDER.map((s) => [s, results.filter((r) => r.verdict.status === s).length] as const);
}

export function writeReports(dir: string, results: Result[], meta: { baseUrl: string; startedAt: Date }) {
  writeFileSync(path.join(dir, "results.json"), JSON.stringify({ ...meta, results }, null, 2));
  writeFileSync(path.join(dir, "report.md"), markdown(results, meta));
  writeFileSync(path.join(dir, "report.html"), html(results, meta));
}

function markdown(results: Result[], meta: { baseUrl: string; startedAt: Date }) {
  const out = [
    `# Requirement test report`,
    ``,
    `${meta.baseUrl} · ${meta.startedAt.toLocaleString()}`,
    ``,
    `| Status | Count |`,
    `|---|---|`,
    ...counts(results).map(([s, n]) => `| ${ICON[s]} ${LABEL[s]} | ${n} |`),
    ``,
  ];
  for (const status of ORDER) {
    const group = results.filter((r) => r.verdict.status === status);
    if (!group.length) continue;
    out.push(`## ${ICON[status]} ${LABEL[status]}`, ``);
    for (const { req, verdict } of group) {
      out.push(`### ${req.id} — ${req.title}`, ``, verdict.summary, ``);
      for (const c of verdict.criteria) out.push(`- ${CRIT[c.status] ?? ""} ${c.criterion} — ${c.note}`);
      if (verdict.error) out.push(``, `Error: \`${verdict.error}\``);
      if (verdict.screenshot) out.push(``, `![${req.id}](${path.basename(verdict.screenshot)})`);
      out.push(``);
    }
  }
  return out.join("\n");
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function html(results: Result[], meta: { baseUrl: string; startedAt: Date }) {
  const sorted = [...results].sort((a, b) => ORDER.indexOf(a.verdict.status) - ORDER.indexOf(b.verdict.status));
  const cards = sorted
    .map(({ req, verdict, seconds }) => `
<details class="card s-${verdict.status}"${verdict.status === "PASS" ? "" : " open"}>
  <summary><span class="pill">${ICON[verdict.status]} ${LABEL[verdict.status]}</span><b>${esc(req.id)}</b> ${esc(req.title)}<small>${seconds}s</small></summary>
  <p>${esc(verdict.summary)}</p>
  ${verdict.criteria.length ? `<ul>${verdict.criteria.map((c) => `<li>${CRIT[c.status] ?? ""} <b>${esc(c.criterion)}</b> — ${esc(c.note)}</li>`).join("")}</ul>` : ""}
  ${verdict.error ? `<pre>${esc(verdict.error)}</pre>` : ""}
  <details><summary>Requirement text &amp; ${verdict.steps.length} steps</summary><pre>${esc(req.body)}</pre><ol>${verdict.steps.map((s) => `<li><code>${esc(s)}</code></li>`).join("")}</ol></details>
  ${verdict.screenshot ? `<a href="${path.basename(verdict.screenshot)}"><img src="${path.basename(verdict.screenshot)}" alt="Final screen for ${esc(req.id)}"></a>` : ""}
</details>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Requirement Test Report</title>
<style>
:root{--bg:#f7f7f8;--card:#fff;--ink:#1b1b1f;--muted:#666;--line:#e3e3e8;--PASS:#1a7f37;--PARTIAL:#b58100;--FAIL:#cf222e;--NOT_IMPLEMENTED:#8250df;--BLOCKED:#57606a}
@media (prefers-color-scheme:dark){:root{--bg:#111214;--card:#1b1c1f;--ink:#e8e8ea;--muted:#9a9aa2;--line:#2c2d31}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:960px;margin:0 auto;padding:24px 16px}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 24px}.stat{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 14px}
.stat b{font-size:1.4em;display:block}
.card{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:8px;margin:10px 0;padding:10px 14px}
${ORDER.map((s) => `.s-${s}{--c:var(--${s})}`).join("")}
.card>summary{cursor:pointer;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.card small{margin-left:auto;color:var(--muted)}
.pill{color:var(--c);font-weight:600}img{max-width:100%;border:1px solid var(--line);border-radius:6px;margin-top:8px;max-height:400px;object-fit:cover;object-position:top}
pre{white-space:pre-wrap;background:var(--bg);padding:8px;border-radius:6px}code{font-size:.85em}.muted{color:var(--muted)}
</style></head><body><main>
<h1>Requirement Test Report</h1><div class="muted">${esc(meta.baseUrl)} · ${meta.startedAt.toLocaleString()}</div>
<div class="stats">${counts(results).map(([s, n]) => `<div class="stat s-${s}"><b style="color:var(--${s})">${n}</b>${LABEL[s]}</div>`).join("")}</div>
${cards}
</main></body></html>`;
}
