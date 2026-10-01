// v6 draft statement PDF, laid out like the template.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fs from "fs";
import path from "path";
import { DEFAULT_FIRM_KEY, FIRMS, getFirm, type FirmKey } from "@/lib/firms";
import { wrapText } from "@/lib/generateRetainerPdf";
import type { DraftDocument, DraftLine } from "@/lib/draftStatement";
import { longDate } from "@/lib/retainerAgreement";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const RED = rgb(0.757, 0, 0.027);
const INK = rgb(0.1, 0.1, 0.1);
const BODY = rgb(0.3, 0.3, 0.3);
const MUTED = rgb(0.5, 0.5, 0.52);
const SHADE = rgb(0.97, 0.97, 0.98);
const RULE = rgb(0.85, 0.85, 0.85);

export async function generateDraftStatementPdf(opts: {
  draft: DraftDocument;
  firmKey?: FirmKey | string | null;
  /** YYYY-MM-DD. */
  preparedOn: string;
}): Promise<Uint8Array> {
  const { draft } = opts;
  const firm = getFirm(opts.firmKey);
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const ensureSpace = (h: number) => {
    if (y - h < MARGIN + 20) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  // Logo: the firm's own, then Nava Wilson's, then its name as text.
  let logoDrawn = false;
  for (const logo of [firm.pdfLogo, FIRMS[DEFAULT_FIRM_KEY].pdfLogo]) {
    try {
      const img = await doc.embedPng(fs.readFileSync(path.join(process.cwd(), "public", logo.file)));
      const w = img.width * (logo.height / img.height);
      page.drawImage(img, { x: MARGIN - w * logo.inkLeft, y: y - logo.height + logo.lift, width: w, height: logo.height });
      y -= logo.height + logo.gap + 10;
      logoDrawn = true;
      break;
    } catch {
      // Try the next logo.
    }
  }
  if (!logoDrawn) {
    page.drawText(firm.legalName, { x: MARGIN, y: y - 18, font: bold, size: 20, color: RED });
    y -= 40;
  }

  page.drawText(draft.title, { x: MARGIN, y, font: bold, size: 19, color: INK });
  y -= 22;

  // Details: a narrow two-column table.
  const detailsW = 280;
  draft.details.forEach((d, i) => {
    const h = 18;
    if (i % 2 === 0) page.drawRectangle({ x: MARGIN, y: y - h + 12, width: detailsW, height: h, color: SHADE });
    page.drawText(d.label, { x: MARGIN + 6, y, font: regular, size: 10, color: BODY });
    const value = wrapText(d.value, bold, 10, detailsW - 110)[0] ?? "";
    page.drawText(value, { x: MARGIN + detailsW - 6 - bold.widthOfTextAtSize(value, 10), y, font: bold, size: 10, color: INK });
    y -= h;
  });
  y -= 10;

  const paragraph = (text: string, font: PDFFont, size: number, color = MUTED) => {
    for (const line of wrapText(text, font, size, CONTENT_W)) {
      ensureSpace(size + 4);
      page.drawText(line, { x: MARGIN, y, font, size, color });
      y -= size + 4;
    }
  };

  const row = (line: DraftLine, shaded: boolean) => {
    const amountFont = bold;
    const amountW = amountFont.widthOfTextAtSize(line.amount, 10);
    const labelW = CONTENT_W - amountW - 30;
    const labelLines = wrapText(line.label, line.total ? bold : regular, 10, labelW);
    const noteLines = line.note ? wrapText(line.note, regular, 8, labelW) : [];
    const h = labelLines.length * 13 + noteLines.length * 10 + 8;
    ensureSpace(h);
    if (shaded) page.drawRectangle({ x: MARGIN, y: y - h + 13, width: CONTENT_W, height: h, color: SHADE });
    if (line.total) page.drawLine({ start: { x: MARGIN, y: y + 13 }, end: { x: MARGIN + CONTENT_W, y: y + 13 }, thickness: 0.6, color: RULE });
    let ly = y;
    for (const l of labelLines) {
      page.drawText(l, { x: MARGIN + 6, y: ly, font: line.total ? bold : regular, size: 10, color: INK });
      ly -= 13;
    }
    for (const n of noteLines) {
      page.drawText(n, { x: MARGIN + 6, y: ly + 2, font: regular, size: 8, color: MUTED });
      ly -= 10;
    }
    page.drawText(line.amount, { x: MARGIN + CONTENT_W - 6 - amountW, y, font: amountFont, size: 10, color: INK });
    y -= h;
  };

  for (const section of draft.sections) {
    ensureSpace(50);
    y -= 8;
    page.drawText(section.title.toUpperCase(), { x: MARGIN, y, font: bold, size: 10, color: RED });
    y -= 18;
    section.lines.forEach((l, i) => row(l, i % 2 === 0));
    if (section.note) {
      y -= 4;
      paragraph(section.note, regular, 8.5);
    }
    y -= 6;
  }

  if (draft.disclaimer) {
    ensureSpace(40);
    y -= 4;
    paragraph(draft.disclaimer, regular, 8.5);
  }

  // Footer on every page.
  const footer = `Draft statement of account  ·  Prepared ${longDate(opts.preparedOn)}`;
  for (const p of doc.getPages()) {
    p.drawText(footer, {
      x: (PAGE_W - regular.widthOfTextAtSize(footer, 8)) / 2,
      y: MARGIN - 20,
      font: regular,
      size: 8,
      color: MUTED,
    });
  }

  return doc.save();
}
