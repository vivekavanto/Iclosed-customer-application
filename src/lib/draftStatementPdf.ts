// Draft statement PDF, per the v6 Word template.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fs from "fs";
import path from "path";
import { getFirm, type FirmKey } from "@/lib/firms";
import { wrapText } from "@/lib/generateRetainerPdf";
import type { DraftDocument, DraftLine } from "@/lib/draftStatement";

// US Letter with the template's margins.
const PAGE_W = 612;
const PAGE_H = 792;
const SIDE = 72;
const TOP = 108;
const BOTTOM = 54;
const CONTENT_W = PAGE_W - SIDE * 2;

// Template colours.
const hex = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
const INK = hex("101828");
const LABEL = hex("4a5565");
const NOTE = hex("6a7282");
const FAINT = hex("99a1af");
const RED = hex("c10007");
const SHADE = hex("f9fafb");
const BORDER = hex("f3f4f6");

// Template sizes, in points.
const TITLE_SIZE = 20;
const ROW_SIZE = 10.5;
const ROW_NOTE_SIZE = 8;
const HEADING_SIZE = 9;
const NOTE_SIZE = 9.5;
const FOOTER_SIZE = 8.5;
const PAD_X = 6.5;
const PAD_Y = 4.5;

// iClosed uses the template wordmark.
const ICLOSED_LOGO = { file: "iclosed-wordmark.png", width: 139.5 };

export async function generateDraftStatementPdf(opts: {
  draft: DraftDocument;
  firmKey?: FirmKey | string | null;
}): Promise<Uint8Array> {
  const { draft } = opts;
  const firm = getFirm(opts.firmKey);
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: { img: Awaited<ReturnType<PDFDocument["embedPng"]>>; w: number; h: number } | null = null;
  try {
    const file = firm.key === "iclosed" ? ICLOSED_LOGO.file : firm.pdfLogo.file;
    const img = await doc.embedPng(fs.readFileSync(path.join(process.cwd(), "public", file)));
    const w = firm.key === "iclosed" ? ICLOSED_LOGO.width : img.width * (firm.pdfLogo.height / img.height);
    logo = { img, w, h: img.height * (w / img.width) };
  } catch {
    // Falls back to the firm name as text.
  }

  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    // Header on every page, like the Word header.
    const top = PAGE_H - 35;
    if (logo) page.drawImage(logo.img, { x: SIDE, y: top - logo.h, width: logo.w, height: logo.h });
    else page.drawText(firm.legalName, { x: SIDE, y: top - 18, font: bold, size: 18, color: RED });
    y = PAGE_H - TOP;
  };
  const ensureSpace = (h: number) => {
    if (y - h < BOTTOM) newPage();
  };
  newPage();

  const paragraph = (text: string, font: PDFFont, size: number, color = NOTE, gap = 4) => {
    for (const line of wrapText(text, font, size, CONTENT_W)) {
      ensureSpace(size + gap);
      y -= size;
      page.drawText(line, { x: SIDE, y, font, size, color });
      y -= gap;
    }
  };

  // One bordered table row.
  const row = (line: DraftLine, shaded: boolean, labelFont = line.total ? bold : regular) => {
    const amountW = bold.widthOfTextAtSize(line.amount, ROW_SIZE);
    const labelW = CONTENT_W - amountW - PAD_X * 4;
    const text = `${line.hstFootnote ? "*" : ""}${line.label}${line.hst ? "*" : ""}`;
    const labelLines = wrapText(text, labelFont, ROW_SIZE, labelW);
    const noteLines = line.note ? wrapText(line.note, regular, ROW_NOTE_SIZE, labelW) : [];
    const h = PAD_Y * 2 + labelLines.length * (ROW_SIZE + 2.5) + noteLines.length * (ROW_NOTE_SIZE + 2);
    ensureSpace(h);
    const top = y;
    page.drawRectangle({
      x: SIDE,
      y: top - h,
      width: CONTENT_W,
      height: h,
      color: shaded ? SHADE : undefined,
      borderColor: BORDER,
      borderWidth: 0.5,
    });
    let ty = top - PAD_Y - ROW_SIZE;
    for (const l of labelLines) {
      page.drawText(l, { x: SIDE + PAD_X, y: ty, font: labelFont, size: ROW_SIZE, color: line.total ? INK : LABEL });
      ty -= ROW_SIZE + 2.5;
    }
    for (const n of noteLines) {
      page.drawText(n, { x: SIDE + PAD_X, y: ty + 1, font: regular, size: ROW_NOTE_SIZE, color: FAINT });
      ty -= ROW_NOTE_SIZE + 2;
    }
    page.drawText(line.amount, {
      x: SIDE + CONTENT_W - PAD_X - amountW,
      y: top - PAD_Y - ROW_SIZE,
      font: bold,
      size: ROW_SIZE,
      color: INK,
    });
    y = top - h;
  };

  // Title and details.
  y -= TITLE_SIZE;
  page.drawText(draft.title, { x: SIDE, y, font: bold, size: TITLE_SIZE, color: INK });
  y -= 14;
  draft.details.forEach((d, i) => row({ label: d.label, amount: d.value }, i % 2 === 0, regular));
  y -= 10;

  for (const section of draft.pdfSections ?? draft.sections) {
    ensureSpace(HEADING_SIZE + 40);
    y -= 12 + HEADING_SIZE;
    page.drawText(section.title, { x: SIDE, y, font: bold, size: HEADING_SIZE, color: RED });
    y -= 6;
    section.lines.forEach((l, i) => row(l, i % 2 === 0));
    if (section.note) {
      y -= 6;
      paragraph(section.note, regular, NOTE_SIZE);
    }
  }

  if (draft.disclaimer) {
    y -= 10;
    paragraph(draft.disclaimer, regular, FOOTER_SIZE, FAINT);
  }

  // Template footer on every page.
  const site = "iclosed.ca";
  const footer = [site, "Draft statement of account", "E. & O.E."].filter(Boolean).join("  ·  ");
  for (const p of doc.getPages()) {
    p.drawText(footer, {
      x: (PAGE_W - regular.widthOfTextAtSize(footer, FOOTER_SIZE)) / 2,
      y: 25,
      font: regular,
      size: FOOTER_SIZE,
      color: FAINT,
    });
  }

  return doc.save();
}
