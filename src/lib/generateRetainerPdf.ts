import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { retainerFaqItems } from "@/lib/retainerFaq";

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
}

/** Wrap long text into lines that fit within maxWidth */
function wrapText(
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
  // logo-full.png is the brand LOCKUP - the iClosed wordmark stacked above
  // "POWERED BY NAVA WILSON" - and it is not a drop-in swap for the old bare
  // logo.png. The two files are cropped completely differently:
  //
  //            file            size      wordmark is...  padding above/below
  //   old      logo.png        90x29     79% of height   14% / 7%
  //   current  logo-full.png   1108x480  41% of height   16% / 21%
  //
  // Drawn at the old logoHeight of 28 the wordmark would come out ~11.5pt,
  // roughly half the ~22pt it has rendered at since this document existed, and
  // the tagline would be illegible. 54pt restores the wordmark to ~22pt
  // (54 * 0.41), and the two offsets below cancel the new file's much larger
  // built-in whitespace so the header block still sits where it always has.
  // Re-measure all four numbers if the logo file is ever re-cropped.
  //
  // The file also carries transparent padding on its LEFT edge - the ink
  // starts at pixel 87 of 1108, i.e. 7.85% of the width - so drawing it at
  // x = margin puts the wordmark ~10pt right of the "Retainer Agreement"
  // heading below it. LOGO_INK_LEFT_FRACTION pulls that padding back out so
  // the two left edges line up.
  try {
    const logoPath = path.join(process.cwd(), "public", "logo-full.png");
    const logoBytes = fs.readFileSync(logoPath);
    const logoImage = await doc.embedPng(logoBytes);
    const logoHeight = 54;
    const logoWidth = logoImage.width * (logoHeight / logoImage.height);
    const LOGO_INK_LEFT_FRACTION = 87 / 1108;
    const logoX = margin - logoWidth * LOGO_INK_LEFT_FRACTION;
    page.drawImage(logoImage, { x: logoX, y: y - logoHeight + 13, width: logoWidth, height: logoHeight });
    y -= logoHeight + 2;
  } catch {
    // Fallback to text if logo file not available
    page.drawText("iClosed", { x: margin, y, font: bold, size: 22, color: brandColor });
    y -= 30;
  }

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
  for (const item of retainerFaqItems) {
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

  // ── Signature Section ──
  ensureSpace(120);
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 20;

  page.drawText("Signature / Acceptance", { x: margin, y, font: bold, size: 12, color: rgb(0.1, 0.1, 0.1) });
  y -= 16;
  const agreementLines = wrapText(
    "I agree to retain iClosed to represent me in my real estate transaction under the terms outlined above.",
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
