import supabaseAdmin from "@/lib/supabaseAdmin";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";

export interface SendResetPasswordEmailResult {
  success: boolean;
  error: string | null;
}

/**
 * Generates a Supabase password-recovery link and emails it via Resend.
 *
 * The recovery link's `redirectTo` is derived from the request `origin` of the
 * caller, so a reset triggered on dev.iclosed.ca lands back on dev, and prod on
 * prod. This replaces delegating to the admin panel, whose link always pointed
 * at production.
 *
 * NOTE: the `origin` must be present in the Supabase dashboard's
 * Authentication → URL Configuration → Redirect URLs allowlist, otherwise
 * Supabase ignores `redirectTo` and falls back to the production Site URL.
 *
 * To avoid leaking which emails have accounts, a missing user is treated as a
 * soft success (no email sent, but success returned).
 */
export async function sendResetPasswordEmail(
  email: string,
  origin: string,
): Promise<SendResetPasswordEmailResult> {
  const baseOrigin = origin.replace(/\/+$/, "");
  const redirectTo = `${baseOrigin}/api/auth/callback?next=/set-password`;

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  const actionLink = data?.properties?.action_link ?? null;

  if (!actionLink) {
    const code = (error as { code?: string } | null)?.code ?? "";
    const msg = error?.message?.toLowerCase() ?? "";
    const userMissing =
      code === "user_not_found" ||
      code === "email_address_not_authorized" ||
      msg.includes("not found") ||
      msg.includes("no user") ||
      msg.includes("does not exist");

    // Don't reveal whether the email exists — succeed silently.
    if (userMissing) {
      console.log("[ResetPasswordEmail] No account for", email, "— soft success");
      return { success: true, error: null };
    }

    console.error(
      "[ResetPasswordEmail] generateLink failed for",
      email,
      ":",
      error?.message,
    );
    return {
      success: false,
      error: error?.message ?? "Failed to generate reset link",
    };
  }

  // Best-effort first name for the greeting.
  let firstName = "";
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("first_name")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    firstName = lead?.first_name ?? "";
  } catch {
    /* greeting is optional */
  }

  const { error: sendError } = await resend.emails.send({
    from: EMAIL_FROM,
    replyTo: EMAIL_REPLY_TO,
    to: email,
    subject: "Reset your iClosed password",
    html: buildResetEmailHtml(actionLink, firstName),
  });

  if (sendError) {
    console.error("[ResetPasswordEmail] Resend send failed for", email, ":", sendError.message);
    return { success: false, error: sendError.message ?? "Failed to send email" };
  }

  console.log("[ResetPasswordEmail] Sent reset link to", email, "redirectTo", redirectTo);
  return { success: true, error: null };
}

function buildResetEmailHtml(actionLink: string, firstName: string): string {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
            <tr>
              <td style="background:linear-gradient(145deg,#c0392b 0%,#8b1a12 100%);padding:28px 32px;">
                <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">iClosed</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">Reset your password</h1>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#4b5563;">${greeting}</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b5563;">
                  We received a request to reset the password for your iClosed account.
                  Click the button below to choose a new password. This link will expire shortly.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background:#c0392b;">
                      <a href="${actionLink}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                        Reset Password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
                  If you didn't request this, you can safely ignore this email — your password won't change.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #f0f0f0;">
                <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} iClosed · All rights reserved</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
