import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

interface RetainerPdfParams {
  fullName: string;
  signature: string;
  signedDate: string;
  propertyAddress: string;
  leadType: string;
  uniqueId: string;
}

const FAQ_ITEMS = [
  {
    question: "Who are we?",
    answer:
      "We are iClosed, a fully online Ontario law firm focused exclusively on real estate transactions. We handle purchases, sales, refinances, and title transfers — all through secure digital platforms, including video signing.",
  },
  {
    question: "Who is the lawyer or law firm representing me?",
    answer:
      "Your transaction will be handled by a licensed Ontario lawyer at iClosed. Our team specializes in real estate closings and will be your point of contact throughout the entire process.",
  },
  {
    question: "What legal services are included in this retainer?",
    answer:
      "Our retainer covers the full scope of legal work needed to close your real estate transaction, including title search, document preparation, registration, and trust account management.",
  },
  {
    question: "How much will it cost?",
    answer:
      "Our fees are transparent and competitive. The exact cost depends on the type and complexity of your transaction. A detailed fee breakdown will be provided before you proceed.",
  },
  {
    question: "Are there any additional costs I should know about?",
    answer:
      "In addition to legal fees, there may be disbursements such as title insurance, registration fees, and land transfer tax. We will provide a full estimate of all costs upfront so there are no surprises.",
  },
  {
    question: "How do I sign documents and communicate with you?",
    answer:
      "All documents can be signed electronically through our secure platform. You can communicate with our team via email, phone, or through your client portal at any time.",
  },
  {
    question: "How do I provide my ID and documents?",
    answer:
      "You can securely upload your identification and documents through your iClosed client portal. We accept standard government-issued photo ID and will guide you through the process.",
  },
  {
    question: "How long does this retainer last?",
    answer:
      "This retainer remains in effect until your real estate transaction is completed and all related legal matters are resolved. You may terminate the retainer at any time by providing written notice.",
  },
  {
    question: "What are your obligations as our client?",
    answer:
      "As our client, you are expected to provide accurate information, respond to requests in a timely manner, and ensure funds are available when required for closing.",
  },
  {
    question: "What happens if I want to cancel?",
    answer:
      "You have the right to cancel this retainer at any time. If you cancel, you will only be responsible for fees and disbursements incurred up to the date of cancellation.",
  },
  {
    question: "Is this agreement legally binding?",
    answer:
      "Yes, once you sign and submit this retainer agreement, it becomes a legally binding contract between you and iClosed for the provision of legal services related to your transaction.",
  },
  {
    question: "Who can I contact with questions?",
    answer:
      "You can reach our team through your client portal, by email, or by phone during business hours. Your assigned closing manager will be your primary point of contact.",
  },
];

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
  const { fullName, signature, signedDate, propertyAddress, leadType, uniqueId } = params;

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
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const logoBytes = fs.readFileSync(logoPath);
    const logoImage = await doc.embedPng(logoBytes);
    const logoHeight = 28;
    const logoWidth = logoImage.width * (logoHeight / logoImage.height);
    page.drawImage(logoImage, { x: margin, y: y - logoHeight + 8, width: logoWidth, height: logoHeight });
    y -= logoHeight + 16;
  } catch {
    // Fallback to text if logo file not available
    page.drawText("iClosed", { x: margin, y, font: bold, size: 22, color: brandColor });
    y -= 30;
  }

  page.drawText("Retainer Agreement", { x: margin, y, font: bold, size: 18, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;

  // Property & type
  page.drawText(propertyAddress || "Address not available", { x: margin, y, font: regular, size: 9, color: rgb(0.4, 0.4, 0.4) });
  y -= 16;
  page.drawText(`Transaction Type: ${leadType || "N/A"}`, { x: margin, y, font: regular, size: 9, color: rgb(0.4, 0.4, 0.4) });
  y -= 16;

  // Divider
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 24;

  // ── FAQ Sections ──
  for (const item of FAQ_ITEMS) {
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
