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
        .eq("client_id", authData.client.id)
        .eq("is_deleted", false);

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
          .eq("client_id", lead.client_id)
          .eq("is_deleted", false);

        dealIds = (deals ?? []).map((d: any) => d.id);
      }

      // fallback → deals directly linked to lead
      if (!dealIds.length) {
        const { data: deals } = await supabaseAdmin
          .from("deals")
          .select("id")
          .eq("lead_id", lead_id)
          .eq("is_deleted", false);

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
    // (Purchase & Sale deals get one set per side)
    // ─────────────────────────────────────────
    for (const dId of dealIds) {
      // Get deal type
      const { data: dealData } = await supabaseAdmin
        .from("deals")
        .select("type")
        .eq("id", dId)
        .single();

      const dealType = (dealData?.type ?? "Purchase").trim();
      const isBoth = dealType.toLowerCase() === "purchase & sale";
      const sides: Array<{ side: "purchase" | "sale" | null; stageType: string }> =
        isBoth
          ? [
              { side: "purchase", stageType: "Purchase" },
              { side: "sale", stageType: "Sale" },
            ]
          : [{ side: null, stageType: getStageTemplateType(dealType) }];

      // ── Self-heal: backfill side on legacy or partially-tagged P&S rows ──
      // Some legacy P&S deals (created before the side flow shipped) and any
      // edge-case rows where convertLead skipped the side assignment land in
      // the DB with side = null. Without this fix, the dashboard side filter
      // strips them and the dedup logic below would insert duplicates.
      if (isBoth) {
        const { data: nullSideRows } = await supabaseAdmin
          .from("milestones")
          .select("id, stage_template_id")
          .eq("deal_id", dId)
          .is("side", null)
          .not("stage_template_id", "is", null);

        if (nullSideRows && nullSideRows.length > 0) {
          const stageIds = [...new Set(nullSideRows.map((r: any) => r.stage_template_id))];
          const { data: stageRows } = await supabaseAdmin
            .from("stage_templates")
            .select("id, lead_type")
            .in("id", stageIds);

          const stageLeadType: Record<string, string> = Object.fromEntries(
            (stageRows ?? []).map((s: any) => [s.id, (s.lead_type ?? "").trim()])
          );

          const purchaseIds = nullSideRows
            .filter((r: any) => stageLeadType[r.stage_template_id] === "Purchase")
            .map((r: any) => r.id);
          const saleIds = nullSideRows
            .filter((r: any) => stageLeadType[r.stage_template_id] === "Sale")
            .map((r: any) => r.id);

          if (purchaseIds.length > 0) {
            await supabaseAdmin.from("milestones").update({ side: "purchase" }).in("id", purchaseIds);
          }
          if (saleIds.length > 0) {
            await supabaseAdmin.from("milestones").update({ side: "sale" }).in("id", saleIds);
          }
        }
      }

      // Fetch existing milestones once per deal (with side) for fast lookup
      const { data: existingMilestones } = await supabaseAdmin
        .from("milestones")
        .select("title, side")
        .eq("deal_id", dId);

      const existingKeys = new Set(
        (existingMilestones ?? []).map(
          (m: any) => `${m.side ?? "_"}:${m.title?.trim().toLowerCase()}`
        )
      );

      for (const { side, stageType } of sides) {
        const { data: stageTemplates } = await supabaseAdmin
          .from("stage_templates")
          .select("id, name, order_index, email_template_id, description, auto_complete")
          .eq("lead_type", stageType)
          .eq("is_deleted", false)
          .order("order_index", { ascending: true });

        if (!stageTemplates || stageTemplates.length === 0) continue;

        // Mirror convertLead.ts status logic: auto_complete templates land in
        // "Completed", first remaining active stage gets "In Progress",
        // everything else "Pending".
        let firstActiveAssigned = false;

        const missingMilestones = stageTemplates
          .filter((st: any) => {
            const cleanName = st.name?.trim().replace(/^\t+/, "").replace(/^->?\s*/, "").toLowerCase();
            return !existingKeys.has(`${side ?? "_"}:${cleanName}`);
          })
          .map((st: any) => {
            const cleanName = st.name?.trim().replace(/^\t+/, "").replace(/^->?\s*/, "") ?? st.name;
            let status: string;
            if (st.auto_complete) {
              status = "Completed";
            } else if (!firstActiveAssigned) {
              status = "In Progress";
              firstActiveAssigned = true;
            } else {
              status = "Pending";
            }
            return {
              deal_id: dId,
              title: cleanName,
              status,
              order_index: st.order_index,
              email_template_id: st.email_template_id ?? null,
              stage_template_id: st.id,
              description: st.description ?? null,
              completed_at: status === "Completed" ? new Date().toISOString() : null,
              side,
            };
          });

        if (missingMilestones.length > 0) {
          const { error: insertError } = await supabaseAdmin
            .from("milestones")
            .insert(missingMilestones);

          if (insertError) {
            console.error(`[milestones] Auto-insert failed for deal ${dId} side ${side}:`, insertError.message);
          }
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
            "id, title, status, milestone_date, order_index, completed_at, deal_id, description, side"
          )
          .in("deal_id", dealIds)
          .eq("is_deleted", false)
          .order("order_index", { ascending: true }),

        supabaseAdmin
          .from("tasks")
          .select("id, milestone_id, completed")
          .in("deal_id", dealIds)
          .eq("is_deleted", false),
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
        side: m.side ?? null,
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
