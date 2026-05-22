import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeal } from "@/lib/getAuthClient";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Map deal type to task_template lead_type
function getTaskTemplateType(dealType: string): string {
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
    // client_id → get ALL deals
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

      // fallback → deals linked directly to lead
      if (!dealIds.length) {
        const { data: deals } = await supabaseAdmin
          .from("deals")
          .select("id")
          .eq("lead_id", lead_id);

        dealIds = (deals ?? []).map((d: any) => d.id);
      }
    }

    // ─────────────────────────────────────────
    // 3️⃣ MANUAL DEAL FILTER
    // if deal_id provided
    // ─────────────────────────────────────────
    if (deal_id) {
      dealIds = [deal_id];
    }

    if (!dealIds.length) {
      return NextResponse.json({ success: true, tasks: [] });
    }

    // ─────────────────────────────────────────
    // Auto-insert missing default tasks from
    // task_templates for each deal
    // (Purchase & Sale deals get one set per side)
    // ─────────────────────────────────────────
    for (const dId of dealIds) {
      // Get deal type to filter correct templates
      const { data: dealData } = await supabaseAdmin
        .from("deals")
        .select("type")
        .eq("id", dId)
        .single();

      const dealType = (dealData?.type ?? "Purchase").trim();
      const isBoth = dealType.toLowerCase() === "purchase & sale";
      const sides: Array<{ side: "purchase" | "sale" | null; templateType: string }> =
        isBoth
          ? [
              { side: "purchase", templateType: "Purchase" },
              { side: "sale", templateType: "Sale" },
            ]
          : [{ side: null, templateType: getTaskTemplateType(dealType) }];

      // ── Self-heal: backfill side on legacy or partially-tagged P&S rows ──
      // Mirrors the same fix in /api/milestones — for P&S deals, derive the
      // side of any null-side row from its task_template's lead_type. Without
      // this, the dashboard side filter strips them and the dedup logic below
      // would insert duplicates.
      if (isBoth) {
        const { data: nullSideRows } = await supabaseAdmin
          .from("tasks")
          .select("id, task_template_id")
          .eq("deal_id", dId)
          .is("side", null)
          .not("task_template_id", "is", null);

        if (nullSideRows && nullSideRows.length > 0) {
          const tplIds = [...new Set(nullSideRows.map((r: any) => r.task_template_id))];
          const { data: tplRows } = await supabaseAdmin
            .from("task_templates")
            .select("id, lead_type")
            .in("id", tplIds);

          const tplLeadType: Record<string, string> = Object.fromEntries(
            (tplRows ?? []).map((t: any) => [t.id, (t.lead_type ?? "").trim()])
          );

          const purchaseIds = nullSideRows
            .filter((r: any) => tplLeadType[r.task_template_id] === "Purchase")
            .map((r: any) => r.id);
          const saleIds = nullSideRows
            .filter((r: any) => tplLeadType[r.task_template_id] === "Sale")
            .map((r: any) => r.id);

          if (purchaseIds.length > 0) {
            await supabaseAdmin.from("tasks").update({ side: "purchase" }).in("id", purchaseIds);
          }
          if (saleIds.length > 0) {
            await supabaseAdmin.from("tasks").update({ side: "sale" }).in("id", saleIds);
          }
        }
      }

      // Fetch existing tasks once per deal (with side) for fast lookup
      const { data: existingTasks } = await supabaseAdmin
        .from("tasks")
        .select("task_template_id, title, side")
        .eq("deal_id", dId);

      const existingTemplateKeys = new Set(
        (existingTasks ?? [])
          .filter((t: any) => t.task_template_id)
          .map((t: any) => `${t.side ?? "_"}:${t.task_template_id}`)
      );
      const existingTitleKeys = new Set(
        (existingTasks ?? []).map(
          (t: any) => `${t.side ?? "_"}:${t.title?.trim().toLowerCase()}`
        )
      );

      // Fetch all milestones for this deal once (with side + stage_template_id)
      const { data: dealMilestones } = await supabaseAdmin
        .from("milestones")
        .select("id, stage_template_id, side")
        .eq("deal_id", dId)
        .order("order_index", { ascending: true });

      for (const { side, templateType } of sides) {
        const { data: taskTemplates } = await supabaseAdmin
          .from("task_templates")
          .select("id, name, role_type, order_index, deadline_rule, stage_template_id, is_shared")
          .eq("lead_type", templateType)
          .eq("is_default", true)
          .eq("is_deleted", false)
          .order("order_index", { ascending: true });

        if (!taskTemplates || taskTemplates.length === 0) continue;

        // Build stage_template_id → milestone_id map scoped to this side
        const stageToMilestone: Record<string, string> = {};
        for (const ms of dealMilestones ?? []) {
          if ((ms.side ?? null) !== side) continue;
          if (ms.stage_template_id) stageToMilestone[ms.stage_template_id] = ms.id;
        }

        const missingTasks = taskTemplates
          .filter((tt: any) => {
            const tplKey = `${side ?? "_"}:${tt.id}`;
            if (existingTemplateKeys.has(tplKey)) return false;
            const titleKey = `${side ?? "_"}:${tt.name?.trim().toLowerCase()}`;
            if (existingTitleKeys.has(titleKey)) return false;
            const role = (tt.role_type ?? "").toLowerCase();
            return role === "client" || role === "both" || role === "";
          })
          .map((tt: any) => ({
            deal_id: dId,
            milestone_id: tt.stage_template_id
              ? (stageToMilestone[tt.stage_template_id] ?? null)
              : null,
            task_template_id: tt.id,
            title: tt.name?.trim() ?? tt.name,
            status: "Pending",
            completed: false,
            role_type: tt.role_type ?? "client",
            is_shared: tt.is_shared ?? false,
            side,
          }));

        if (missingTasks.length > 0) {
          const { error: insertError } = await supabaseAdmin
            .from("tasks")
            .insert(missingTasks);

          if (insertError) {
            console.error(`[tasks] Auto-insert failed for deal ${dId} side ${side}:`, insertError.message);
          }
        }
      }
    }

    // ─────────────────────────────────────────
    // Fetch Tasks
    // ─────────────────────────────────────────
    const [{ data: tasks, error: tasksError }, { data: milestones }] =
      await Promise.all([
        supabaseAdmin
          .from("tasks")
          .select("*, task_template:task_templates(order_index)")
          .in("deal_id", dealIds)
          .order("due_date", { ascending: true, nullsFirst: false }),

        supabaseAdmin
          .from("milestones")
          .select("id, title, order_index, status")
          .in("deal_id", dealIds),
      ]);

    if (tasksError) {
      return NextResponse.json(
        { success: false, error: tasksError.message },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────
    // Auto-sync: if milestone is Completed but
    // task is not, mark task as completed
    // ─────────────────────────────────────────
    const milestoneMap = Object.fromEntries(
      (milestones ?? []).map((m: any) => [m.id, m])
    );

    const outOfSyncTaskIds: string[] = [];
    for (const t of tasks ?? []) {
      if (t.milestone_id && !t.completed) {
        const ms = milestoneMap[t.milestone_id];
        if (ms && ms.status === "Completed") {
          outOfSyncTaskIds.push(t.id);
        }
      }
    }

    if (outOfSyncTaskIds.length > 0) {
      await supabaseAdmin
        .from("tasks")
        .update({ completed: true, status: "Completed", completed_at: new Date().toISOString() })
        .in("id", outOfSyncTaskIds);

      // Update local task data to reflect the change
      for (const t of tasks ?? []) {
        if (outOfSyncTaskIds.includes(t.id)) {
          t.completed = true;
          t.status = "Completed";
        }
      }
    }

    // ─────────────────────────────────────────
    // Attach milestone info to tasks. Also flatten the joined
    // task_template.order_index up to a top-level field so the dashboard can
    // sort "Needs Your Attention" by the per-task order configured in the
    // task_templates table.
    // ─────────────────────────────────────────
    const enriched = (tasks ?? []).map((t: any) => {
      const tpl = Array.isArray(t.task_template) ? t.task_template[0] : t.task_template;
      const { task_template, ...rest } = t;
      return {
        ...rest,
        milestones: t.milestone_id ? milestoneMap[t.milestone_id] ?? null : null,
        template_order_index: tpl?.order_index ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      tasks: enriched,
      deal_ids: dealIds,
    });
  } catch (err) {
    console.error("GET /api/tasks error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
