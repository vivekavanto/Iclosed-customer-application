import supabaseAdmin from "@/lib/supabaseAdmin";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";
import { renderMilestoneTemplate } from "@/lib/email-templates/milestone";

/**
 * When a milestone completes, check if it has an email_template_id.
 * If yes, fetch the template from the DB, render it, and send via Resend.
 *
 * This fires for both primary purchaser and co-purchaser milestones.
 */
export async function triggerMilestoneEmail(milestoneId: string): Promise<void> {
  try {
    // Fetch the milestone with its email_template_id and deal info
    const { data: milestone } = await supabaseAdmin
      .from("milestones")
      .select("id, email_template_id, deal_id, title, status")
      .eq("id", milestoneId)
      .single();

    if (!milestone || !milestone.email_template_id) return;
    if (milestone.status !== "Completed") return;

    // Get the deal → lead → client email for sending
    const { data: deal } = await supabaseAdmin
      .from("deals")
      .select("id, lead_id, client_id")
      .eq("id", milestone.deal_id)
      .single();

    if (!deal) return;

    // Fetch the email template from the database
    const { data: template } = await supabaseAdmin
      .from("email_templates")
      .select("name, body")
      .eq("id", milestone.email_template_id)
      .eq("is_active", true)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .single();

    if (!template) {
      console.warn(`[MilestoneEmail] No template found for id ${milestone.email_template_id}`);
      return;
    }

    // Fetch recipient email and lead details
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("email, first_name, last_name, lead_type, address_street, address_city")
      .eq("id", deal.lead_id)
      .single();

    if (!lead?.email) {
      console.warn(`[MilestoneEmail] No email found for lead ${deal.lead_id}`);
      return;
    }

    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
    const leadAddress = [lead.address_street, lead.address_city].filter(Boolean).join(", ");

    // Render the template with variables matching DB placeholders
    const html = renderMilestoneTemplate(template.body, {
      "user.first_name": lead.first_name || "",
      "user.last_name": lead.last_name || "",
      "user.get_full_name": fullName,
      "lead_type": lead.lead_type || "",
      "lead_address": leadAddress,
      "milestone_title": milestone.title || "",
    });

    // Send via Resend — use template name as subject fallback
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: lead.email,
      subject: template.name || `Update: ${milestone.title}`,
      html,
    });

    if (error) {
      console.warn(`[MilestoneEmail] Resend error for milestone "${milestone.title}":`, error);
    } else {
      console.log(`[MilestoneEmail] Sent for milestone "${milestone.title}" (deal: ${deal.id})`);
    }
  } catch (err) {
    console.error("[MilestoneEmail] Error:", err);
  }
}
