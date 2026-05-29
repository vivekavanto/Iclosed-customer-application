// One-off: convert REVIEW.md into a styled, print-ready HTML file.
// No external deps — a focused Markdown subset covering exactly what REVIEW.md uses
// (headings, tables, bold, italic, inline code, blockquotes, hr, lists, links).
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "REVIEW.md");
const OUT = path.join(__dirname, "..", "REVIEW.html");

const md = fs.readFileSync(SRC, "utf8");

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inline formatting: code first (so its contents aren't further parsed), then bold, italic, links.
function inline(text) {
  let t = escapeHtml(text);
  // inline code `...`
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // links [text](url) -> keep text only (these are file refs, not web links)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label) => `<span class="ref">${label}</span>`);
  // bold **...**
  t = t.replace(/\*\*([^*]+)\*\*/g, (_, b) => `<strong>${b}</strong>`);
  // italic *...*
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, (_, pre, i) => `${pre}<em>${i}</em>`);
  return t;
}

const lines = md.split(/\r?\n/);
let html = [];
let i = 0;

function flushTable(startIdx) {
  // collect consecutive table rows
  const rows = [];
  let j = startIdx;
  while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
    rows.push(lines[j]);
    j++;
  }
  const parse = (row) =>
    row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const header = parse(rows[0]);
  // rows[1] is the |---|---| separator
  const bodyRows = rows.slice(2);
  let out = "<table><thead><tr>";
  header.forEach((h) => (out += `<th>${inline(h)}</th>`));
  out += "</tr></thead><tbody>";
  bodyRows.forEach((r) => {
    out += "<tr>";
    parse(r).forEach((c) => (out += `<td>${inline(c)}</td>`));
    out += "</tr>";
  });
  out += "</tbody></table>";
  html.push(out);
  return j;
}

let inList = false;
function closeList() {
  if (inList) {
    html.push("</ul>");
    inList = false;
  }
}

while (i < lines.length) {
  const line = lines[i];

  // table
  if (/^\s*\|.*\|\s*$/.test(line)) {
    closeList();
    i = flushTable(i);
    continue;
  }
  // hr
  if (/^---+\s*$/.test(line)) {
    closeList();
    html.push("<hr/>");
    i++;
    continue;
  }
  // headings
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    closeList();
    const level = h[1].length;
    html.push(`<h${level}>${inline(h[2])}</h${level}>`);
    i++;
    continue;
  }
  // blockquote
  if (/^>\s?/.test(line)) {
    closeList();
    const quote = line.replace(/^>\s?/, "");
    html.push(`<blockquote>${inline(quote)}</blockquote>`);
    i++;
    continue;
  }
  // list item
  if (/^\s*-\s+/.test(line)) {
    if (!inList) {
      html.push("<ul>");
      inList = true;
    }
    html.push(`<li>${inline(line.replace(/^\s*-\s+/, ""))}</li>`);
    i++;
    continue;
  }
  // blank
  if (/^\s*$/.test(line)) {
    closeList();
    i++;
    continue;
  }
  // paragraph (gather until blank/structural)
  closeList();
  html.push(`<p>${inline(line)}</p>`);
  i++;
}

const styled = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>iClosed Web Application — Project Review</title>
<style>
  body { font-family: "Calibri","Segoe UI",Arial,sans-serif; color:#1a1a1a; line-height:1.5;
         max-width: 900px; margin: 40px auto; padding: 0 32px; font-size: 11pt; }
  h1 { font-size: 24pt; color:#0b3d91; border-bottom:3px solid #0b3d91; padding-bottom:8px; }
  h2 { font-size: 16pt; color:#0b3d91; margin-top:28px; border-bottom:1px solid #ccc; padding-bottom:4px; }
  h3 { font-size: 13pt; color:#222; margin-top:20px; }
  h4 { font-size: 11.5pt; color:#b00020; margin-top:16px; margin-bottom:4px; }
  p { margin: 8px 0; }
  code { background:#f3f3f3; border:1px solid #e0e0e0; border-radius:3px; padding:1px 4px;
         font-family:"Consolas",monospace; font-size:9.5pt; }
  .ref { font-family:"Consolas",monospace; font-size:9.5pt; color:#0b3d91; }
  blockquote { border-left:4px solid #f0ad4e; background:#fff8ec; margin:12px 0; padding:8px 16px;
               font-style:italic; }
  table { border-collapse:collapse; width:100%; margin:14px 0; font-size:10pt; }
  th { background:#0b3d91; color:#fff; text-align:left; padding:7px 9px; }
  td { border:1px solid #ddd; padding:6px 9px; vertical-align:top; }
  tr:nth-child(even) td { background:#f7f9fc; }
  ul { margin:8px 0 8px 0; padding-left:22px; }
  li { margin:3px 0; }
  hr { border:none; border-top:1px solid #ddd; margin:24px 0; }
  strong { color:#000; }
  @media print { body { margin:0; max-width:100%; } h2 { page-break-after:avoid; } table,blockquote{ page-break-inside:avoid; } }
</style></head><body>
${html.join("\n")}
</body></html>`;

fs.writeFileSync(OUT, styled, "utf8");
console.log("Wrote " + OUT);
