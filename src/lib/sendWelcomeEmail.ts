import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { buildWelcomeEmailHtml } from "@/lib/email-templates/welcome";

/**
 * Sends a welcome email to a lead and marks it as sent.
 * Shared across login, welcome-email route, and intake.
 */
export async function sendWelcomeEmail(leadId: string): Promise<boolean> {
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select(
        "id, parent_lead_id, co_person_role, first_name, last_name, email, lead_type, address_street, address_city, address_province, address_postal_code, selling_address_street, selling_address_city, selling_address_province, selling_address_postal_code",
      )
      .eq("id", leadId)
      .single();

    if (!lead?.email) {
      console.warn("[WelcomeEmail] No email found for lead:", leadId);
      return false;
    }

    const { html, subject } = await buildWelcomeEmailHtml({ lead });

    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: lead.email,
      subject,
      html,
    });

    if (error) {
      console.error("[WelcomeEmail] Resend error for lead:", leadId, error);
      return false;
    }

    await supabaseAdmin
      .from("leads")
      .update({ welcome_email_sent: true })
      .eq("id", leadId);

    console.log("[WelcomeEmail] Sent for lead:", leadId);
    return true;
  } catch (err) {
    console.error("[WelcomeEmail] Error for lead:", leadId, err);
    return false;
  }
}
