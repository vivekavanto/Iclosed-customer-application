import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { getRetainerFaqItems, retainerAgreementLine } from "@/lib/retainerFaq";
import { DEFAULT_FIRM_KEY, FIRMS, getFirm, type FirmKey } from "@/lib/firms";
import { longDate, type RetainerAgreement } from "@/lib/retainerAgreement";

interface RetainerPdfParams {
  fullName: string;
  signature: string;
  signedDate: string;
  propertyAddress: string;
  leadType: string;
  uniqueId: string;
  side?: "purchase" | "sale" | null;
  // When BOTH are provided, the PDF renders two address lines labelled
  // "Purchase Property" and "Sale Property" (used for combined P&S retainers).
  purchaseAddress?: string;
  saleAddress?: string;
  /**
   * Which firm the client is retaining. Sets the lockup, the FAQ wording and
   * the entity on the "I agree to retain ___" line. Omitted / unrecognised
   * means Nava Wilson — what every retainer said before firms existed, so an
   * un-migrated caller reproduces the old document exactly.
   */
  firmKey?: FirmKey | string | null;
  /** v9 purchase/sale agreement; replaces the FAQ body when present. */
  agreement?: RetainerAgreement | null;
}

/** Wrap long text into lines that fit within maxWidth */
export function wrapText(
  text: string,
  font: Awaited<ReturnType<typeof PDFDocument.prototype.embedFont>>,
  fontSize: number,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function generateRetainerPdf(
  params: RetainerPdfParams
): Promise<Uint8Array> {
  const {
    fullName,
    signature,
    signedDate,
    propertyAddress,
    leadType,
    uniqueId,
    purchaseAddress,
    saleAddress,
  } = params;

  const firm = getFirm(params.firmKey);

  const isCombined = Boolean(purchaseAddress && saleAddress);

  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 50;
  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;
  const lineHeight = 14;
  const brandColor = rgb(0.757, 0, 0.027); // #C10007

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function ensureSpace(needed: number) {
    if (y - needed < margin) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  // ── Header with logo ──
  //
  // The two firms ship DIFFERENT artwork, and it is not interchangeable — the
  // files are cropped completely differently:
  //
  //     firm         file            size      wordmark is...  padding above/below
  //     Nava Wilson  logo-full.png   1108x480  41% of height   16% / 21%
  //     iClosed LLP  logo.png          90x29   79% of height   14% /  7%
  //
  // So the height, the lift, the gap and the left-edge trim all travel WITH
  // the file, on the firm profile (see FirmProfile.pdfLogo). Drawing logo.png
  // at logo-full.png's 54pt would render the wordmark at ~43pt, double the
  // ~22pt this document has always used; drawing logo-full.png at logo.png's
  // 28pt would halve it and leave the tagline illegible.
  //
  // Both files also carry transparent padding on their LEFT edge — the ink
  // starts at pixel 87 of 1108 (7.85%) in logo-full.png and at pixel 2 of 90
  // (2.2%) in logo.png — so drawing either at x = margin pushes the wordmark
  // right of the "Retainer Agreement" heading below it, by ~10pt for the Nava
  // Wilson lockup. pdfLogo.inkLeft pulls that padding back out so the two left
  // edges line up. Re-measure every number on the profile if either file is
  // ever re-cropped.
  //
  // The firm's own lockup first, the Nava Wilson one as a fallback — each with
  // ITS OWN geometry, because a fallback drawn to the wrong file's numbers is
  // barely better than no fallback. Both files ship today, so this only covers
  // a deploy that lost one: a wrong-tagline letterhead beats a generation
  // failure that blocks a client from signing.
  const logoCandidates = [firm.pdfLogo, FIRMS[DEFAULT_FIRM_KEY].pdfLogo].filter(
    (candidate, i, all) => all.findIndex((c) => c.file === candidate.file) === i,
  );
  let logoDrawn = false;
  for (const candidate of logoCandidates) {
    try {
      const logoPath = path.join(process.cwd(), "public", candidate.file);
      const logoBytes = fs.readFileSync(logoPath);
      const logoImage = await doc.embedPng(logoBytes);
      const logoHeight = candidate.height;
      const logoWidth = logoImage.width * (logoHeight / logoImage.height);
      page.drawImage(logoImage, {
        x: margin - logoWidth * candidate.inkLeft,
        y: y - logoHeight + candidate.lift,
        width: logoWidth,
        height: logoHeight,
      });
      y -= logoHeight + candidate.gap;
      logoDrawn = true;
      break;
    } catch {
      // Missing or unreadable — try the next candidate.
    }
  }
  if (!logoDrawn) {
    // Neither file could be read: fall back to the firm's name as a wordmark.
    page.drawText(firm.legalName, { x: margin, y, font: bold, size: 22, color: brandColor });
    y -= 30;
  }

  if (params.agreement) {
    drawAgreement(params.agreement);
  } else {
    page.drawText("Retainer Agreement", { x: margin, y, font: bold, size: 18, color: rgb(0.1, 0.1, 0.1) });
    y -= 28;

    // Property address(es)
    if (isCombined) {
      // Combined P&S retainer — show both labelled addresses
      const labelWidth = 130;
      page.drawText("Purchase Property:", { x: margin, y, font: bold, size: 9, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(purchaseAddress || "Address not available", {
        x: margin + labelWidth,
        y,
        font: regular,
        size: 9,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= 14;
      page.drawText("Sale Property:", { x: margin, y, font: bold, size: 9, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(saleAddress || "Address not available", {
        x: margin + labelWidth,
        y,
        font: regular,
        size: 9,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= 16;
    } else {
      page.drawText(propertyAddress || "Address not available", { x: margin, y, font: regular, size: 9, color: rgb(0.4, 0.4, 0.4) });
      y -= 16;
    }

    page.drawText(`Transaction Type: ${leadType || "N/A"}`, { x: margin, y, font: regular, size: 9, color: rgb(0.4, 0.4, 0.4) });
    y -= 16;

    // Divider
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    y -= 24;

    // ── FAQ Sections ──
    for (const item of getRetainerFaqItems(firm)) {
      // Question
      const qLines = wrapText(item.question, bold, 10, contentWidth);
      ensureSpace(qLines.length * lineHeight + 10);
      for (const line of qLines) {
        page.drawText(line, { x: margin, y, font: bold, size: 10, color: rgb(0.1, 0.1, 0.1) });
        y -= lineHeight;
      }
      y -= 2;

      // Answer
      const aLines = wrapText(item.answer, regular, 9, contentWidth);
      ensureSpace(aLines.length * lineHeight);
      for (const line of aLines) {
        page.drawText(line, { x: margin, y, font: regular, size: 9, color: rgb(0.3, 0.3, 0.3) });
        y -= lineHeight;
      }
      y -= 12;
    }
  }

  // v9 agreement body.
  function drawAgreement(a: RetainerAgreement) {
    const ink = rgb(0.1, 0.1, 0.1);
    const body = rgb(0.3, 0.3, 0.3);
    const muted = rgb(0.45, 0.45, 0.45);

    const paragraph = (text: string, font = regular, size = 9, color = body) => {
      for (const line of wrapText(text, font, size, contentWidth)) {
        ensureSpace(lineHeight);
        page.drawText(line, { x: margin, y, font, size, color });
        y -= lineHeight;
      }
    };
    // Bold label then body text; two strings per line keep spacing.
    const labelled = (label: string, text: string) => {
      const words = [
        ...label.split(" ").map((w) => ({ w, b: true })),
        ...text.split(" ").map((w) => ({ w, b: false })),
      ];
      const lineWidth = (ws: typeof words) => {
        const b = ws.filter((t) => t.b).map((t) => t.w).join(" ");
        const r = ws.filter((t) => !t.b).map((t) => t.w).join(" ");
        return bold.widthOfTextAtSize(b, 9) + regular.widthOfTextAtSize((b && r ? " " : "") + r, 9);
      };
      const lines: (typeof words)[] = [];
      let cur: typeof words = [];
      for (const t of words) {
        if (cur.length && lineWidth([...cur, t]) > contentWidth) {
          lines.push(cur);
          cur = [];
        }
        cur.push(t);
      }
      if (cur.length) lines.push(cur);

      for (const ws of lines) {
        ensureSpace(lineHeight);
        const b = ws.filter((t) => t.b).map((t) => t.w).join(" ");
        const r = ws.filter((t) => !t.b).map((t) => t.w).join(" ");
        let x = margin;
        if (b) {
          page.drawText(b, { x, y, font: bold, size: 9, color: ink });
          x += bold.widthOfTextAtSize(b + " ", 9);
        }
        if (r) page.drawText(r, { x, y, font: regular, size: 9, color: body });
        y -= lineHeight;
      }
      y -= 6;
    };
    const heading = (text: string) => {
      ensureSpace(30);
      y -= 8;
      page.drawText(text.toUpperCase(), { x: margin, y, font: bold, size: 10, color: brandColor });
      y -= 18;
    };
    const table = (rows: { label: string; amount: string }[], head?: boolean) => {
      const all = head ? [{ label: "If this happens", amount: "Fee" }, ...rows] : rows;
      all.forEach((r, i) => {
        const isHead = head && i === 0;
        const amountWidth = bold.widthOfTextAtSize(r.amount, 9);
        const labelLines = wrapText(r.label, isHead ? bold : regular, 9, contentWidth - amountWidth - 24);
        const h = labelLines.length * lineHeight + 8;
        ensureSpace(h);
        const shade = isHead ? rgb(0.85, 0.85, 0.85) : i % 2 === (head ? 1 : 0) ? rgb(0.97, 0.97, 0.98) : undefined;
        if (shade) {
          page.drawRectangle({ x: margin, y: y - h + lineHeight - 2, width: contentWidth, height: h, color: shade });
        }
        labelLines.forEach((l, j) => {
          page.drawText(l, { x: margin + 6, y: y - j * lineHeight, font: isHead ? bold : regular, size: 9, color: isHead ? ink : body });
        });
        page.drawText(r.amount, { x: margin + contentWidth - 6 - amountWidth, y, font: bold, size: 9, color: ink });
        y -= h;
      });
      y -= 4;
    };

    page.drawText(a.title, { x: margin, y, font: bold, size: 18, color: ink });
    y -= 20;
    paragraph(a.meta.join("  \u00b7  "), regular, 9, muted);
    y -= 8;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    y -= 18;

    a.sections.forEach((sec) => labelled(sec.label, sec.body));
    heading("Your fees");
    table(a.fees);
    paragraph(a.feeNote, regular, 8, muted);
    heading("If something changes");
    paragraph(a.changesIntro, regular, 8, muted);
    y -= 4;
    table(a.changes, true);
    heading("Definitions");
    a.definitions.forEach((d) => labelled(d.label, d.body));
    y -= 6;
    paragraph(a.acceptance, bold, 9, ink);
    y -= 12;
  }

  // ── Signature Section ──
  if (params.agreement) {
    // v9: signature left, date right, one shaded row.
    ensureSpace(60);
    const rowH = 30;
    const baseY = y - 18;
    page.drawRectangle({ x: margin, y: y - rowH, width: contentWidth, height: rowH, color: rgb(0.97, 0.97, 0.98) });
    const gray = rgb(0.35, 0.35, 0.4);
    const ink = rgb(0.1, 0.1, 0.1);
    page.drawText("Signature", { x: margin + 6, y: baseY, font: regular, size: 10, color: gray });
    const sigX = margin + 6 + regular.widthOfTextAtSize("Signature", 10) + 8;
    page.drawText(signature, { x: sigX + 2, y: baseY + 1, font: italic, size: 13, color: ink });
    page.drawLine({ start: { x: sigX, y: baseY - 3 }, end: { x: sigX + 200, y: baseY - 3 }, thickness: 0.8, color: ink });

    const dateText = longDate(signedDate);
    const dateLineW = Math.max(110, regular.widthOfTextAtSize(dateText, 10) + 8);
    const dateLineX = margin + contentWidth - 6 - dateLineW;
    const dateLabelX = dateLineX - 8 - bold.widthOfTextAtSize("Date", 10);
    page.drawText("Date", { x: dateLabelX, y: baseY, font: bold, size: 10, color: ink });
    page.drawText(dateText, { x: dateLineX + 4, y: baseY, font: regular, size: 10, color: ink });
    page.drawLine({ start: { x: dateLineX, y: baseY - 3 }, end: { x: dateLineX + dateLineW, y: baseY - 3 }, thickness: 0.8, color: ink });

    y -= rowH + 12;
    page.drawText(`${fullName}  \u00b7  ${uniqueId}`, { x: margin, y, font: regular, size: 8, color: gray });
    return doc.save();
  }

  ensureSpace(120);
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 20;

  page.drawText("Signature / Acceptance", { x: margin, y, font: bold, size: 12, color: rgb(0.1, 0.1, 0.1) });
  y -= 16;
  const agreementLines = wrapText(
    retainerAgreementLine(firm),
    regular,
    9,
    contentWidth
  );
  for (const line of agreementLines) {
    page.drawText(line, { x: margin, y, font: regular, size: 9, color: rgb(0.4, 0.4, 0.4) });
    y -= lineHeight;
  }
  y -= 16;

  // Signature fields — matching the layout mockup
  const labelX = margin;
  const valueX = margin + 90;

  // Full Name
  page.drawText("Full Name:", { x: labelX, y, font: bold, size: 10, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(fullName, { x: valueX, y, font: regular, size: 10, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;

  // Date
  page.drawText("Date:", { x: labelX, y, font: bold, size: 10, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(signedDate, { x: valueX, y, font: regular, size: 10, color: rgb(0.1, 0.1, 0.1) });
  y -= 36;

  // Signature block: signature text on top, underline, unique ID below
  page.drawText("Signature:", { x: labelX, y, font: bold, size: 10, color: rgb(0.2, 0.2, 0.2) });

  // Signature text (italic) above the line
  const sigY = y + 4;
  page.drawText(signature, { x: valueX, y: sigY, font: italic, size: 14, color: rgb(0.1, 0.1, 0.1) });

  // Underline
  const lineY = y - 2;
  const sigLineWidth = 220;
  page.drawLine({
    start: { x: valueX, y: lineY },
    end: { x: valueX + sigLineWidth, y: lineY },
    thickness: 0.8,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Unique ID below the line
  page.drawText(uniqueId, { x: valueX, y: lineY - 14, font: regular, size: 9, color: rgb(0.4, 0.4, 0.4) });

  return doc.save();
}
