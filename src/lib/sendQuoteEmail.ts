import { sendEmail } from "@/lib/email/emailTransport";
import { normalizeRecipientEmail } from "@/lib/firmEmail";
import { loadLeadQuote } from "@/lib/leadQuote";
import { signQuoteToken } from "@/lib/quoteToken";
import { buildQuoteEmailHtml } from "@/lib/email-templates/quote";

/** Sends the intake quote email to a buy/sell lead. Never throws. */
export async function sendQuoteEmail(leadId: string): Promise<boolean> {
  try {
    const quote = await loadLeadQuote(leadId);
    if (!quote?.email) return false;

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL || "https://iclosed-customer-application-rosy.vercel.app"
    ).replace(/\/+$/, "");

    const { subject, html } = buildQuoteEmailHtml({
      firmKey: quote.firmKey,
      firstName: quote.firstName,
      side: quote.side,
      propertyShort: quote.propertyShort,
      propertyFull: quote.propertyFull,
      legalFees: quote.legalFees,
      disbursements: quote.disbursements,
      quoteUrl: `${siteUrl}/quote/${signQuoteToken(leadId)}`,
      siteUrl,
    });

    const result = await sendEmail(
      { to: [normalizeRecipientEmail(quote.email)], subject, html },
      { firm: quote.firmKey, label: "quote" },
    );
    if (!result.ok) {
      console.error("[QuoteEmail] send failed for lead:", leadId, result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[QuoteEmail] Error for lead:", leadId, err);
    return false;
  }
}
