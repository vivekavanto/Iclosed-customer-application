import supabaseAdmin from "@/lib/supabaseAdmin";

/**
 * When a milestone completes, check if it has an email_template_id.
 * If yes, trigger the milestone email via the admin portal webhook.
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

    const adminUrl =
      process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL ||
      "https://iclosed-admin-panel.vercel.app";

    // Trigger milestone email via admin portal
    const res = await fetch(`${adminUrl}/api/admin/send-milestone-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        milestone_id: milestone.id,
        deal_id: deal.id,
        lead_id: deal.lead_id,
        client_id: deal.client_id,
        email_template_id: milestone.email_template_id,
        milestone_title: milestone.title,
      }),
    });

    if (!res.ok) {
      console.warn(`[MilestoneEmail] Failed for milestone ${milestone.title}:`, await res.text());
    } else {
      console.log(`[MilestoneEmail] Triggered for milestone "${milestone.title}" (deal: ${deal.id})`);
    }
  } catch (err) {
    console.error("[MilestoneEmail] Error:", err);
  }
}
