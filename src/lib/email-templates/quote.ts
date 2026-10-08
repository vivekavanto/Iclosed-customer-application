import { esc, money } from "@/lib/closingEstimateEmail";
import { getFirm, type FirmKey } from "@/lib/firms";
import { dollars } from "@/lib/iclosedFees";
import { QUOTE_TEAM, type QuoteSide } from "@/lib/quotePricing";

const QUOTE_CSM = QUOTE_TEAM.csm;

export interface QuoteEmailContent {
  firmKey?: FirmKey | null;
  firstName?: string | null;
  side: QuoteSide;
  /** e.g. "424 Calderstone Crescent" — used in the subject. */
  propertyShort: string;
  /** e.g. "424 Calderstone Crescent, Toronto" — bolded in the body. */
  propertyFull: string;
  legalFees: number;
  disbursements: number;
  /** From fee settings, e.g. "Estimated disbursements". */
  disbursementsLabel?: string;
  /** Sale and purchase bundle: street addresses and the discount. */
  bundle?: { saleProperty: string; purchaseProperty: string; discount: number } | null;
  quoteUrl: string;
  siteUrl: string;
}

const RED = "#B3211E";
const INK = "#111827";
const BODY = "#374151";
const MUTED = "#6B7280";
const FONT = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

const CONGRATS: Record<QuoteSide, string> = {
  buying: "Congratulations on your purchase.",
  selling: "Congratulations on your sale.",
  both: "Congratulations on your sale and your new home.",
  refinance: "Thanks for thinking of us for your refinance.",
  condo: "Congratulations on your new condo.",
};

const PURCHASE_TAX_NOTE =
  "Those are our fees, before HST. Land transfer tax and title insurance are paid to the government and to the insurer, and your quote sets those out separately.";

const TAX_NOTE: Record<QuoteSide, string> = {
  buying: PURCHASE_TAX_NOTE,
  both:
    "Those are our fees for both closings, before HST. They include {discount} off because we are closing both. Land transfer tax and title insurance on your purchase are paid to the government and to the insurer, and your quote sets those out separately.",
  condo:
    "Those are our fees for your occupancy and final closing, before HST. Land transfer tax and title insurance are paid at final closing, and your quote sets those out separately.",
  selling: "Those are our fees, before HST. They come out of your sale proceeds, so you pay nothing upfront.",
  refinance:
    "Those are our fees, before HST. Your lender's title insurance is paid to the insurer, and your quote sets it out separately.",
};

// Spec TypeLabel; bundles say "sale and purchase".
const SUBJECT_TYPE: Partial<Record<QuoteSide, string>> = {
  both: "sale and purchase ",
  buying: "purchase ",
  selling: "sale ",
  refinance: "refinance ",
  condo: "new condo ",
};

export function quoteEmailSubject(propertyShort: string, side?: QuoteSide): string {
  const type = (side && SUBJECT_TYPE[side]) ?? "";
  return propertyShort ? `Your ${type}quote for ${propertyShort}` : "Your iClosed quote";
}

function step(n: number, text: string): string {
  return `
    <tr>
      <td valign="top" style="padding:0 16px 18px 0;width:38px;">
        <div style="width:38px;height:38px;line-height:38px;border-radius:19px;background:#FBE4E3;color:${RED};font-weight:700;font-size:16px;text-align:center;">${n}</div>
      </td>
      <td valign="top" style="padding:0 0 18px;font-size:16px;line-height:1.6;color:${BODY};">${text}</td>
    </tr>`;
}

export function buildQuoteEmailHtml(c: QuoteEmailContent): { subject: string; html: string } {
  const firm = getFirm(c.firmKey);
  const name = (c.firstName ?? "").trim() || "there";
  const entity = firm.introName.replace("iClosed LLP", "iClosed powered by Nava Wilson");
  const both = c.side === "both";
  const taxNote = TAX_NOTE[c.side].replace("{discount}", dollars(c.bundle?.discount ?? 0));
  const b = both ? c.bundle : null;
  const strong = (text: string) => `<strong style="color:${INK};">${esc(text)}</strong>`;
  // Bundles name both properties: "selling X and buying Y".
  const subjectOf = b
    ? `selling ${strong(b.saleProperty || "your sale")} and buying ${strong(b.purchaseProperty || "your new home")}`
    : strong(c.propertyFull || "your property");
  const legalLabel = both ? "Legal fees, both closings" : "Legal fees";
  const step2 = both
    ? "When you are ready, continue from the quote. That opens your two retainers, one for the sale and one for the purchase, and we get started on both files."
    : "When you are ready, continue from the quote. That opens your retainer and we get started on your file.";
  const step3 = `We send you your dashboard, where you can watch every step of ${both ? "both closings" : "the closing"} and sign remotely.`;

  const html = `
<div style="background:#F3F4F6;padding:24px 12px;font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#FAFAFA;border:1px solid #E5E7EB;border-radius:14px;">
    <tr><td style="padding:40px 44px 8px;">
      <div style="font-size:34px;font-weight:800;letter-spacing:-0.5px;color:${INK};"><span style="color:${RED};font-style:italic;">i</span>Closed</div>
      <p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:${BODY};">Hi ${esc(name)},</p>
      <p style="margin:18px 0 0;font-size:16px;line-height:1.6;color:${BODY};">
        ${CONGRATS[c.side]} Your quote for ${subjectOf} is ready.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#F6F7F9;border:1px solid #EEF0F3;border-radius:10px;">
        <tr>
          <td style="padding:22px 24px;" valign="bottom">
            <div style="font-size:14px;color:${MUTED};">${legalLabel}</div>
            <div style="font-size:32px;font-weight:800;color:${INK};line-height:1.2;">${esc(money(c.legalFees))}</div>
          </td>
          <td style="padding:22px 24px;text-align:right;" valign="bottom">
            <div style="font-size:14px;color:${MUTED};">${esc(c.disbursementsLabel ?? "Disbursements")}</div>
            <div style="font-size:24px;font-weight:800;color:${INK};line-height:1.3;">${esc(money(c.disbursements))}</div>
          </td>
        </tr>
      </table>

      <p style="margin:0;font-size:16px;line-height:1.6;color:${BODY};">${taxNote}</p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 28px;">
        <tr><td style="background:${RED};border-radius:6px;">
          <a href="${esc(c.quoteUrl)}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;">View your quote</a>
        </td></tr>
      </table>

      <div style="border-top:1px solid #E5E7EB;padding-top:24px;">
        <p style="margin:0 0 18px;font-size:17px;font-weight:700;color:${INK};">What happens next</p>
        <table role="presentation" cellpadding="0" cellspacing="0">
          ${step(1, `Review your quote. ${esc(QUOTE_CSM.fullName)}, your Customer Success Manager, will call you to confirm the details and answer anything you want to ask.`)}
          ${step(2, step2)}
          ${step(3, step3)}
        </table>
      </div>

      <p style="margin:8px 0 0;font-size:16px;line-height:1.6;color:${BODY};">Any questions, just reply. We answer as often as you ask and it never costs extra.</p>

      <p style="margin:24px 0 32px;font-size:16px;line-height:1.6;color:${BODY};">
        ${esc(QUOTE_CSM.firstName)}<br/>iClosed<br/>
        <a href="tel:${QUOTE_CSM.phone.replace(/\D/g, "")}" style="color:${MUTED};font-weight:600;text-decoration:none;">${esc(QUOTE_CSM.phone)}</a>
      </p>
    </td></tr>
    <tr><td style="padding:20px 44px 24px;border-top:1px solid #EEF0F3;background:#F7F8FA;border-radius:0 0 14px 14px;">
      <p style="margin:0 0 10px;font-size:15px;">
        <a href="${esc(c.siteUrl)}" style="color:${BODY};text-decoration:none;margin-right:22px;">Pricing</a>
        <a href="${esc(c.siteUrl)}/contact" style="color:${BODY};text-decoration:none;">Contact</a>
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">
        ${esc(entity)} &nbsp;·&nbsp; Toronto, Ontario<br/>
        You are getting this because you asked us for a quote at iclosed.ca.
      </p>
    </td></tr>
  </table>
</div>`;

  return { subject: quoteEmailSubject(c.propertyShort, c.side), html };
}
