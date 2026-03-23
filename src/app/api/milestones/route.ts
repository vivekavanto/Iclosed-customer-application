import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeal } from "@/lib/getAuthClient";

export const dynamic = "force-dynamic";

// Map deal type to stage template lead_type
// "Purchase & Sale" uses Purchase stage templates
function getStageTemplateType(dealType: string): string {
  switch (dealType) {
    case "Purchase & Sale":
      return "Purchase";
    case "Sale":
      return "Sale";
    case "Refinance":
      return "Refinance";
    default:
      return "Purchase";
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lead_id = searchParams.get("lead_id");
    const deal_id = searchParams.get("deal_id");

    const authData = await getAuthClientDeal();

    let dealIds: string[] = [];

    // ─────────────────────────────────────────
    // 1️⃣ AUTHENTICATED CLIENT
    // client_id → ALL deals
    // ─────────────────────────────────────────
    if (authData?.client) {
      const { data: deals } = await supabaseAdmin
        .from("deals")
        .select("id")
        .eq("client_id", authData.client.id);

      dealIds = (deals ?? []).map((d: any) => d.id);
    }

    // ─────────────────────────────────────────
    // 2️⃣ LEAD LOGIN FLOW
    // lead_id → client_id → deals
    // ─────────────────────────────────────────
    if (!dealIds.length && lead_id) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("client_id")
        .eq("id", lead_id)
        .maybeSingle();

      if (lead?.client_id) {
        const { data: deals } = await supabaseAdmin
          .from("deals")
          .select("id")
          .eq("client_id", lead.client_id);

        dealIds = (deals ?? []).map((d: any) => d.id);
      }

      // fallback → deals directly linked to lead
      if (!dealIds.length) {
        const { data: deals } = await supabaseAdmin
          .from("deals")
          .select("id")
          .eq("lead_id", lead_id);

        dealIds = (deals ?? []).map((d: any) => d.id);
      }
    }

    // ─────────────────────────────────────────
    // 3️⃣ Optional deal filter
    // ─────────────────────────────────────────
    if (deal_id) {
      dealIds = [deal_id];
    }

    if (!dealIds.length) {
      return NextResponse.json({ success: true, milestones: [] });
    }

    // ─────────────────────────────────────────
    // Auto-insert missing default milestones
    // from stage_templates for each deal
    // ─────────────────────────────────────────
    for (const dId of dealIds) {
      // Get deal type
      const { data: dealData } = await supabaseAdmin
        .from("deals")
        .select("type")
        .eq("id", dId)
        .single();

      const dealType = dealData?.type ?? "Purchase";
      const stageType = getStageTemplateType(dealType);

      // Fetch stage templates for this deal type
      const { data: stageTemplates } = await supabaseAdmin
        .from("stage_templates")
        .select("id, name, order_index, email_template_id, description")
        .eq("lead_type", stageType)
        .order("order_index", { ascending: true });

      if (!stageTemplates || stageTemplates.length === 0) continue;

      // Fetch existing milestones for this deal
      const { data: existingMilestones } = await supabaseAdmin
        .from("milestones")
        .select("title")
        .eq("deal_id", dId);

      const existingTitles = new Set(
        (existingMilestones ?? []).map((m: any) => m.title?.trim().toLowerCase())
      );

      // Find templates that are NOT already in milestones (match by title)
      const missingMilestones = stageTemplates
        .filter((st: any) => {
          const cleanName = st.name?.trim().replace(/^\t+/, "").replace(/^->?\s*/, "").toLowerCase();
          return !existingTitles.has(cleanName);
        })
        .map((st: any) => {
          const cleanName = st.name?.trim().replace(/^\t+/, "").replace(/^->?\s*/, "") ?? st.name;
          return {
            deal_id: dId,
            title: cleanName,
            status: st.order_index === 1 ? "In Progress" : st.order_index === 2 ? "Waiting" : "Pending",
            order_index: st.order_index,
            email_template_id: st.email_template_id ?? null,
            stage_template_id: st.id,
            description: st.description ?? null,
          };
        });

      if (missingMilestones.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from("milestones")
          .insert(missingMilestones);

        if (insertError) {
          console.error(`[milestones] Auto-insert failed for deal ${dId}:`, insertError.message);
        }
      }
    }

    // ─────────────────────────────────────────
    // Fetch milestones + tasks
    // ─────────────────────────────────────────
    const [{ data: milestones, error: msError }, { data: tasks }] =
      await Promise.all([
        supabaseAdmin
          .from("milestones")
          .select(
            "id, title, status, milestone_date, order_index, completed_at, deal_id, description"
          )
          .in("deal_id", dealIds)
          .order("order_index", { ascending: true }),

        supabaseAdmin
          .from("tasks")
          .select("id, milestone_id, completed")
          .in("deal_id", dealIds),
      ]);

    if (msError) {
      return NextResponse.json(
        { success: false, error: msError.message },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────
    // Count tasks per milestone
    // ─────────────────────────────────────────
    const enriched = (milestones ?? []).map((m: any) => {
      const mTasks = (tasks ?? []).filter(
        (t: any) => t.milestone_id === m.id
      );

      return {
        id: m.id,
        title: m.title,
        status: m.status,
        milestone_date: m.milestone_date,
        order_index: m.order_index,
        completed_at: m.completed_at,
        deal_id: m.deal_id,
        description: m.description ?? null,
        total_tasks: mTasks.length,
        completed_tasks: mTasks.filter((t: any) => t.completed).length,
      };
    });

    return NextResponse.json({
      success: true,
      milestones: enriched,
      deal_ids: dealIds,
    });
  } catch (err) {
    console.error("GET /api/milestones error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
