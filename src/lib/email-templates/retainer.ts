const LOGO_URL = "https://iclosed-admin-panel.vercel.app/logo.png";

export function buildRetainerEmailHtml(params: {
  firstName: string;
  propertyAddress: string;
  leadType: string;
}): { html: string; subject: string } {
  const { firstName, propertyAddress, leadType } = params;

  const html = `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>Hi ${firstName || "there"},</p>

  <p>Thank you for signing your retainer agreement with iClosed.</p>

  <p>Please find a copy of your signed retainer agreement attached to this email for your records.</p>

  <table style="margin: 16px 0; border-collapse: collapse;">
    <tr>
      <td style="padding: 4px 12px 4px 0; font-weight: bold; color: #555;">Property:</td>
      <td style="padding: 4px 0;">${propertyAddress || "N/A"}</td>
    </tr>
    <tr>
      <td style="padding: 4px 12px 4px 0; font-weight: bold; color: #555;">Transaction:</td>
      <td style="padding: 4px 0;">${leadType || "N/A"}</td>
    </tr>
  </table>

  <p>If you have any questions, feel free to reach out through your client portal or reply to this email.</p>

  <p>Best regards,<br>The iClosed Team</p>

  <br>
  <img src="${LOGO_URL}" alt="iClosed by Nava Wilson" style="width:70px;height:auto;" />
</div>`;

  return { html, subject: "Your Signed Retainer Agreement — iClosed" };
}
