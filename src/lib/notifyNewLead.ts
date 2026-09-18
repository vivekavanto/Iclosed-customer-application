// In-app alert for the back office when a new lead completes intake.
//
// Written from the PORTAL, straight into the shared `notifications` table,
// because intake lives here and never calls the admin app — hooking an admin
// code path would mean this alert never fires at all. That is the same reason
// the all-tasks-complete alert was implemented in both repos rather than behind
// a webhook: a cross-app HTTP hop adds failure modes and buys nothing when both
// apps already hold the service-role key for the same database.
//
// The row is a BROADCAST: every admin sees it, and read state is per-admin in
// `notification_reads`. The admin app renders it in the header bell, on
// /admin/notifications, and as the yellow dot on the sidebar's Leads button.
//
// Best-effort by contract: never throws. A failed alert must not fail an
// intake — the lead is already saved and the client is already being shown
// their confirmation.

import supabaseAdmin from "@/lib/supabaseAdmin";

/**
 * Event key for a newly created lead.
 *
 * MIRRORED in the admin app (`iclosed_dev_admin/src/lib/notificationTypes.ts`,
 * NEW_LEAD_TYPE). The admin filters the Leads badge on this exact string, so
 * changing it in one repo alone silently stops the dot from ever lighting.
 */
export const NEW_LEAD_TYPE = "lead.created";

export type NotifyNewLeadResult = {
  notified: boolean;
  reason?: "no_lead" | "error";
};

/**
 * Write the "a new lead just signed up" row into the admin notification feed.
 *
 * Called once per intake, for the primary lead. Co-purchasers created in the
 * same submission belong to the same arriving file, so one row is what staff
 * want to see — not one per person.
 *
 * @param leadId the lead just created by intake
 */
export async function notifyNewLead(leadId: string): Promise<NotifyNewLeadResult> {
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select(
        "id, first_name, last_name, email, lead_type, referral_source, address_city, address_province, selling_address_city, selling_address_province",
      )
      .eq("id", leadId)
      .maybeSingle();

    if (!lead) {
      console.warn("[NewLeadNotification] Lead not found:", leadId);
      return { notified: false, reason: "no_lead" };
    }

    const clientName =
      [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || "Someone";

    // City/province only — enough to recognise the file at a glance without
    // turning the feed into a second copy of the lead record.
    const area =
      [lead.address_city, lead.address_province].filter(Boolean).join(", ") ||
      [lead.selling_address_city, lead.selling_address_province].filter(Boolean).join(", ") ||
      "";

    // Same one-sentence shape as the other two event titles, so the dropdown
    // reads consistently.
    const title = `${clientName} just signed up as a new lead on iClosed.`;

    const bodyParts = [lead.lead_type, area].filter(Boolean);
    const body = bodyParts.length
      ? `${bodyParts.join(" · ")} — open Leads for the details.`
      : "Open Leads for the details.";

    // deal_id stays null on purpose: a lead has no deal until an admin
    // converts it. The admin's notificationHref() falls back to lead_id and
    // opens /admin/leads?lead=<id>.
    const { error } = await supabaseAdmin.from("notifications").insert({
      type: NEW_LEAD_TYPE,
      title,
      body,
      deal_id: null,
      lead_id: lead.id,
      file_number: null,
      metadata: {
        client_name: clientName,
        lead_type: lead.lead_type ?? null,
        area: area || null,
        email: lead.email ?? null,
        referral_source: lead.referral_source ?? null,
      },
    });

    if (error) {
      console.error("[NewLeadNotification] failed to write in-app notification:", error);
      return { notified: false, reason: "error" };
    }

    console.log("[NewLeadNotification] notified — lead:", leadId);
    return { notified: true };
  } catch (err) {
    console.error("[NewLeadNotification] unexpected failure for lead:", leadId, err);
    return { notified: false, reason: "error" };
  }
}
