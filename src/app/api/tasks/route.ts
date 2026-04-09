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
    // ─────────────────────────────────────────
    for (const dId of dealIds) {
      // Get deal type to filter correct templates
      const { data: dealData } = await supabaseAdmin
        .from("deals")
        .select("type")
        .eq("id", dId)
        .single();

      const dealType = dealData?.type ?? "Purchase";
      const templateType = getTaskTemplateType(dealType);

      // Fetch only default task templates for this deal's lead type
      const { data: taskTemplates } = await supabaseAdmin
        .from("task_templates")
        .select("id, name, role_type, order_index, deadline_rule, stage_template_id, is_shared")
        .eq("lead_type", templateType)
        .eq("is_default", true)
        .eq("is_deleted", false)
        .order("order_index", { ascending: true });

      if (!taskTemplates || taskTemplates.length === 0) continue;

      // Fetch existing tasks for this deal — match by task_template_id
      const { data: existingTasks } = await supabaseAdmin
        .from("tasks")
        .select("task_template_id, title")
        .eq("deal_id", dId);

      const existingTemplateIds = new Set(
        (existingTasks ?? []).map((t: any) => t.task_template_id).filter(Boolean)
      );
      const existingTitles = new Set(
        (existingTasks ?? []).map((t: any) => t.title?.trim().toLowerCase())
      );

      // Get all milestones for this deal (with stage_template_id for matching)
      const { data: dealMilestones } = await supabaseAdmin
        .from("milestones")
        .select("id, stage_template_id")
        .eq("deal_id", dId)
        .order("order_index", { ascending: true });

      // Build map: stage_template_id → milestone_id
      const stageToMilestone: Record<string, string> = {};
      let firstMilestoneId: string | null = null;
      for (const ms of dealMilestones ?? []) {
        if (!firstMilestoneId) firstMilestoneId = ms.id;
        if (ms.stage_template_id) stageToMilestone[ms.stage_template_id] = ms.id;
      }

      // Find templates not yet inserted — match by task_template_id first, fallback to title
      const missingTasks = taskTemplates
        .filter((tt: any) => {
          // Skip if already inserted by template ID
          if (existingTemplateIds.has(tt.id)) return false;
          // Fallback: skip if a task with same title already exists
          if (existingTitles.has(tt.name?.trim().toLowerCase())) return false;
          // Only client-facing tasks
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
        }));

      if (missingTasks.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from("tasks")
          .insert(missingTasks);

        if (insertError) {
          console.error(`[tasks] Auto-insert failed for deal ${dId}:`, insertError.message);
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
          .select("*")
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
    // Attach milestone info to tasks
    // ─────────────────────────────────────────
    const enriched = (tasks ?? []).map((t: any) => ({
      ...t,
      milestones: t.milestone_id ? milestoneMap[t.milestone_id] ?? null : null,
    }));

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
