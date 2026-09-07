import supabaseAdmin from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email/emailTransport";
import { normalizeRecipientEmail } from "@/lib/firmEmail";
import { getLeadFirmKey } from "@/lib/leadFirm";
import { brandEmailHtml } from "@/lib/emailBrand";
import { renderMilestoneTemplate, resolveTemplateSubject } from "@/lib/email-templates/milestone";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";
import {
  recipientSideForLead,
  resolveMilestoneSide,
  shouldEmailForSide,
} from "@/lib/recipientSide";

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
      .select("id, email_template_id, deal_id, title, status, side, stage_template_id")
      .eq("id", milestoneId)
      .single();

    if (!milestone || !milestone.email_template_id) return;
    if (milestone.status !== "Completed") return;

    // Which side of a Purchase & Sale file this stage belongs to. Every family
    // deal carries BOTH sides' milestones, so without this a purchase-side stage
    // emails the co-sellers too. Null = not side-specific, send to everyone.
    const milestoneSide = await resolveMilestoneSide(milestone);

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
      .select(
        "email, first_name, last_name, lead_type, address_street, address_city, parent_lead_id, co_person_role",
      )
      .in("id", leadIds);

    if (!leads || leads.length === 0) return;

    // Which firm this file is retained under decides the sender address and the
    // brand lockup. Resolved ONCE, from the deal's own lead: a family is retained
    // by one firm (getLeadFirmKey reads the ROOT lead), so resolving per-recipient
    // would be N identical queries for one answer.
    //
    // Before this, the milestone email was the only client-facing send in this app
    // that never resolved a firm: it went out from the generic EMAIL_FROM and
    // skipped brandEmailHtml(), while rendering a shared email_templates row that
    // DOES carry a logo <img>. Every milestone email therefore shipped the Nava
    // Wilson lockup to iClosed LLP clients, from an iClosed address.
    const firm = await getLeadFirmKey(deal.lead_id);

    // Send email to each lead (primary + co-purchasers)
    for (const lead of leads) {
      if (!lead.email) continue;

      // Skip the other side of a Purchase & Sale file. The primary is both
      // purchaser and seller so they always receive it; only co-people whose
      // recorded side disagrees with the milestone are skipped.
      const leadSide = recipientSideForLead(lead);
      if (!shouldEmailForSide(milestoneSide, leadSide)) {
        console.log(
          `[MilestoneEmail] Skipped ${lead.email} — ${leadSide}-side co-person, ${milestoneSide}-side milestone "${milestone.title}"`,
        );
        continue;
      }

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

      const result = await sendEmail(
        {
          to: [normalizeRecipientEmail(lead.email)],
          subject,
          html: brandEmailHtml(html, firm),
        },
        { firm, label: "milestone" },
      );

      if (!result.ok) {
        console.warn(
          `[MilestoneEmail] send failed for "${milestone.title}" to ${lead.email}:`,
          result.error,
        );
      } else {
        console.log(`[MilestoneEmail] Sent "${milestone.title}" to ${lead.email}`);
      }
    }
  } catch (err) {
    console.error("[MilestoneEmail] Error:", err);
  }
}
