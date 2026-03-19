import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeal } from "@/lib/getAuthClient";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Default tasks should display for ALL lead types
// Fetch all task templates regardless of deal type
function getTaskTemplateTypes(): string[] {
  return ["Purchase", "Sale", "Refinance"];
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
      // Fetch task templates for all lead types (default tasks apply to all deals)
      const templateTypes = getTaskTemplateTypes();

      const { data: taskTemplates } = await supabaseAdmin
        .from("task_templates")
        .select("id, name, role_type, order_index, deadline_rule")
        .in("lead_type", templateTypes)
        .eq("is_deleted", false)
        .order("order_index", { ascending: true });

      if (!taskTemplates || taskTemplates.length === 0) continue;

      // Fetch existing tasks for this deal (title only — task_template_id may not exist)
      const { data: existingTasks } = await supabaseAdmin
        .from("tasks")
        .select("title")
        .eq("deal_id", dId);

      const existingTitles = new Set(
        (existingTasks ?? []).map((t: any) => t.title?.trim().toLowerCase())
      );

      // Get first milestone for this deal to link tasks
      const { data: firstMilestone } = await supabaseAdmin
        .from("milestones")
        .select("id")
        .eq("deal_id", dId)
        .order("order_index", { ascending: true })
        .limit(1)
        .maybeSingle();

      const firstMilestoneId = firstMilestone?.id ?? null;

      // Find templates not yet inserted (deduplicate by title)
      const seenTitles = new Set<string>();
      const missingTasks = taskTemplates
        .filter((tt: any) => {
          const cleanTitle = tt.name?.trim().toLowerCase();
          // Skip if a task with same title already exists in DB
          if (existingTitles.has(cleanTitle)) return false;
          // Skip duplicate template names (e.g. same task in Purchase + Sale)
          if (seenTitles.has(cleanTitle)) return false;
          seenTitles.add(cleanTitle);
          // Only client-facing tasks
          const role = (tt.role_type ?? "").toLowerCase();
          return role === "client" || role === "both" || role === "";
        })
        .map((tt: any) => ({
          deal_id: dId,
          milestone_id: firstMilestoneId,
          title: tt.name?.trim() ?? tt.name,
          status: "Pending",
          completed: false,
          role_type: tt.role_type ?? "client",
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
    // Attach milestone info to tasks
    // ─────────────────────────────────────────
    const milestoneMap = Object.fromEntries(
      (milestones ?? []).map((m: any) => [m.id, m])
    );

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
