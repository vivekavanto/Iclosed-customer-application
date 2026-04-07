import supabaseAdmin from "@/lib/supabaseAdmin";
import { renderMilestoneTemplate } from "./milestone";

export async function buildWelcomeEmailHtml(params: {
  lead: any;
}): Promise<{ html: string; subject: string }> {
  const { lead } = params;

  // Fetch the "Welcome Email" template from Supabase
  const { data: template, error } = await supabaseAdmin
    .from("email_templates")
    .select("name, body")
    .ilike("name", "Welcome Email%")
    .eq("is_active", true)
    .or("is_deleted.eq.false,is_deleted.is.null")
    .limit(1)
    .maybeSingle();

  if (error || !template?.body) {
    throw new Error("Welcome Email template not found in Supabase 'email_templates' table.");
  }

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  const leadAddress = [lead.address_street, lead.address_city].filter(Boolean).join(", ");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://iclosed-customer-application-rosy.vercel.app";
  const logoUrl = `${siteUrl}/logo.png`;

  const bodyContent = renderMilestoneTemplate(template.body, {
    "user.first_name": lead.first_name || "",
    "user.last_name": lead.last_name || "",
    "user.get_full_name": fullName || "there",
    "lead_type": lead.lead_type || "property",
    "lead_address": leadAddress || "your property",
    "first_name": lead.first_name || "there",
    "dashboard_link": `${siteUrl}/login`
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to iClosed</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header with Logo -->
          <tr>
            <td style="background-color:#1e3a5f;padding:24px 40px;text-align:center;">
              <img src="${logoUrl}" alt="iClosed" height="36" style="height:36px;filter:brightness(0) invert(1);" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;font-size:16px;color:#374151;line-height:1.6;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:13px;">
                &copy; ${new Date().getFullYear()} iClosed. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html, subject: template.name || "Welcome to iClosed!" };
}
