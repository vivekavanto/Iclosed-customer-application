import supabaseAdmin from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { advanceMilestone } from "@/lib/syncSharedTask";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";

export async function POST(req: Request) {
  try {
    const { lead_id, side } = (await req.json()) as {
      lead_id?: string;
      side?: "purchase" | "sale";
    };

    if (!lead_id) {
      return NextResponse.json({ success: false, error: "Missing lead_id" }, { status: 400 });
    }

    // Per-side flag drives Buy & Sell. Always also flip the legacy aps_uploaded
    // boolean so existing readers (convertLead, dashboard) keep working.
    const update: Record<string, boolean> = { aps_uploaded: true };
    if (side === "purchase") update.aps_uploaded_purchase = true;
    else if (side === "sale") update.aps_uploaded_sale = true;

    // 1. Mark primary lead as aps_uploaded
    await supabaseAdmin
      .from("leads")
      .update(update)
      .eq("id", lead_id);

    // 2. Also mark co-person leads (children of this lead)
    await supabaseAdmin
      .from("leads")
      .update(update)
      .eq("parent_lead_id", lead_id);

    // 3. If this lead was already auto-converted (deal exists),
    //    retroactively complete the APS task + sync to linked deals
    const { data: deal } = await supabaseAdmin
      .from("deals")
      .select("id")
      .eq("lead_id", lead_id)
      .maybeSingle();

    if (deal) {
      await completeApsTaskForDeal(deal.id);
    }

    // 4. Also check co-person deals (they may have been auto-converted too)
    const { data: coPersonLeads } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("parent_lead_id", lead_id);

    if (coPersonLeads && coPersonLeads.length > 0) {
      for (const cpLead of coPersonLeads) {
        const { data: cpDeal } = await supabaseAdmin
          .from("deals")
          .select("id")
          .eq("lead_id", cpLead.id)
          .maybeSingle();

        if (cpDeal) {
          await completeApsTaskForDeal(cpDeal.id);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/intake/mark-aps-uploaded error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

/**
 * Find the APS task on a deal, mark it completed, advance the milestone,
 * and sync to all linked co-purchaser deals.
 */
async function completeApsTaskForDeal(dealId: string) {
  const { data: apsTask } = await supabaseAdmin
    .from("tasks")
    .select("id, milestone_id, task_template_id, is_shared")
    .eq("deal_id", dealId)
    .ilike("title", "%agreement of purchase and sale%")
    .eq("completed", false)
    .maybeSingle();

  if (!apsTask) return;

  await supabaseAdmin
    .from("tasks")
    .update({ completed: true, status: "Completed", completed_at: new Date().toISOString() })
    .eq("id", apsTask.id);

  if (apsTask.milestone_id) {
    await advanceMilestone(dealId, apsTask.milestone_id);
  }

  // Sync to linked co-purchaser deals (regardless of is_shared flag,
  // since APS is a deal-level task that should apply to all linked purchasers)
  const linkedDealIds = await getLinkedDealIds(dealId);
  for (const linkedDealId of linkedDealIds) {
    const { data: linkedApsTask } = await supabaseAdmin
      .from("tasks")
      .select("id, milestone_id")
      .eq("deal_id", linkedDealId)
      .ilike("title", "%agreement of purchase and sale%")
      .eq("completed", false)
      .maybeSingle();

    if (linkedApsTask) {
      await supabaseAdmin
        .from("tasks")
        .update({ completed: true, status: "Completed", completed_at: new Date().toISOString() })
        .eq("id", linkedApsTask.id);

      if (linkedApsTask.milestone_id) {
        await advanceMilestone(linkedDealId, linkedApsTask.milestone_id);
      }
    }
  }
}
