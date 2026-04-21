import supabaseAdmin from "@/lib/supabaseAdmin";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";
import { renderMilestoneTemplate, resolveTemplateSubject } from "@/lib/email-templates/milestone";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";

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
      .select("name, subject, body")
      .eq("id", milestone.email_template_id)
      .eq("is_active", true)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .single();

    if (!template) {
      console.warn(`[MilestoneEmail] No template found for id ${milestone.email_template_id}`);
      return;
    }

    // Collect all deal IDs to email (primary + co-purchasers)
    const dealIdsToEmail = [deal.id];
    try {
      const linkedIds = await getLinkedDealIds(deal.id);
      dealIdsToEmail.push(...linkedIds);
    } catch (linkErr) {
      console.warn("[MilestoneEmail] Failed to fetch linked deals, sending to primary only:", linkErr);
    }

    // Fetch all leads for these deals
    const { data: deals } = await supabaseAdmin
      .from("deals")
      .select("lead_id")
      .in("id", dealIdsToEmail);

    const leadIds = deals?.map((d) => d.lead_id).filter(Boolean) ?? [];
    if (leadIds.length === 0) return;

    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("email, first_name, last_name, lead_type, address_street, address_city")
      .in("id", leadIds);

    if (!leads || leads.length === 0) return;

    // Send email to each lead (primary + co-purchasers)
    for (const lead of leads) {
      if (!lead.email) continue;

      const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
      const leadAddress = [lead.address_street, lead.address_city].filter(Boolean).join(", ");

      const variables = {
        "user.first_name": lead.first_name || "",
        "user.last_name": lead.last_name || "",
        "user.get_full_name": fullName,
        "lead_type": lead.lead_type || "",
        "lead_address": leadAddress,
        "milestone_title": milestone.title || "",
      };

      const html = renderMilestoneTemplate(template.body, variables);
      const subject = resolveTemplateSubject(
        template,
        variables,
        `Update: ${milestone.title}`,
      );

      const { error } = await resend.emails.send({
        from: EMAIL_FROM,
        replyTo: EMAIL_REPLY_TO,
        to: lead.email,
        subject,
        html,
      });

      if (error) {
        console.warn(`[MilestoneEmail] Resend error for "${milestone.title}" to ${lead.email}:`, error);
      } else {
        console.log(`[MilestoneEmail] Sent "${milestone.title}" to ${lead.email}`);
      }
    }
  } catch (err) {
    console.error("[MilestoneEmail] Error:", err);
  }
}
