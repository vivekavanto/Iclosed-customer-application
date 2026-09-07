import { CONTACT_INBOX_TO } from "@/lib/resend";
import { sendEmail } from "@/lib/email/emailTransport";

export interface ContactMessagePayload {
  name: string;
  email: string;
  phone: string;
  message: string;
}

/** Everything below is typed by a stranger, so nothing reaches the HTML raw. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Delivers a "Contact us" submission to the firm's support inbox.
 *
 * Reply-to is the VISITOR's address, not the shared support alias: staff hit
 * Reply and the answer goes to the person who wrote in, which is the whole
 * point of the form. The visitor is never mailed by this route — the only
 * recipient is CONTACT_INBOX_TO, a fixed address we own — so the form cannot be
 * turned into a relay that mails an arbitrary third party.
 */
export async function sendContactMessageEmail(
  payload: ContactMessagePayload,
): Promise<boolean> {
  try {
    const submittedAt = new Date().toLocaleString("en-CA");

    const row = (label: string, value: string) => `
      <tr>
        <td style="padding: 6px 16px 6px 0; color:#555; white-space:nowrap; vertical-align:top;"><strong>${label}</strong></td>
        <td style="padding: 6px 0; vertical-align:top;">${escapeHtml(value) || "—"}</td>
      </tr>`;

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.5;">
        <h2 style="margin: 0 0 16px; font-size: 18px;">New message from the website contact form</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
          ${row("Name", payload.name)}
          ${row("Email", payload.email)}
          ${row("Phone", payload.phone)}
          ${row("Submitted at", submittedAt)}
        </table>
        <div style="margin-top: 20px;">
          <strong style="display:block; margin-bottom: 6px; color:#555;">Message</strong>
          <div style="white-space: pre-wrap; padding: 12px 14px; background:#f7f7f7; border-radius: 6px; max-width: 560px;">${escapeHtml(
            payload.message,
          )}</div>
        </div>
        <p style="margin: 20px 0 0; font-size: 12px; color:#888;">
          Reply to this email to answer ${escapeHtml(payload.name)} directly.
        </p>
      </div>
    `;

    // Public contact form: no file, so no firm. The visitor is the reply-to.
    const result = await sendEmail(
      {
        to: [CONTACT_INBOX_TO],
        subject: `Contact form: ${payload.name}`,
        html,
      },
      { firm: null, label: "contact-message", replyTo: payload.email },
    );

    if (!result.ok) {
      console.error("[ContactMessage] send failed:", result.error);
      return false;
    }

    console.log("[ContactMessage] Sent from:", payload.email);
    return true;
  } catch (err) {
    console.error("[ContactMessage] Unexpected error:", err);
    return false;
  }
}
