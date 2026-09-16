import supabaseAdmin from "@/lib/supabaseAdmin";
import { getFamilyTaskRoster } from "@/lib/familyTaskTargets";

export const TREEFORT_TASK_TITLE = "Treefort ID Verification";

function isSigningField(label: string | null | undefined): boolean {
  return (label ?? "").toLowerCase().includes("in person or virtually");
}

// Adds a Treefort task for every party on this side once anyone chooses virtual
// signing; retires pending ones when nobody does any more. Never throws.
export async function syncTreefortTasks(personalInfoTaskId: string): Promise<void> {
  try {
    const roster = await getFamilyTaskRoster(personalInfoTaskId);
    if (!roster) return;
    const side = roster.task.side;

    const partyTaskIds = roster.members.map((m) => m.task_id).filter((id): id is string => !!id);
    const [{ data: answers }, { data: partyTasks }] = await Promise.all([
      supabaseAdmin
        .from("task_responses")
        .select("field_label, value")
        .in("task_id", partyTaskIds),
      supabaseAdmin.from("tasks").select("deal_id").in("id", partyTaskIds),
    ]);
    const virtual = (answers ?? []).some(
      (r) => isSigningField(r.field_label) && String(r.value ?? "").toLowerCase().includes("virtual"),
    );
    const dealIds = [...new Set((partyTasks ?? []).map((t) => t.deal_id))];
    if (dealIds.length === 0) return;

    const leadType = side === "sale" || (side == null && roster.deal.type === "Sale") ? "Sale" : "Purchase";
    const { data: tpl } = await supabaseAdmin
      .from("task_templates")
      .select("id, name, stage_template_id, order_index, role_type")
      .eq("lead_type", leadType)
      .ilike("name", "%treefort%")
      .eq("is_deleted", false)
      .limit(1)
      .maybeSingle();
    if (!tpl) {
      console.error(`[Treefort] No ${leadType} "Treefort ID Verification" template — run sql/add_treefort_task.sql.`);
      return;
    }

    let existingQ = supabaseAdmin
      .from("tasks")
      .select("id, deal_id, completed")
      .in("deal_id", dealIds)
      .eq("task_template_id", tpl.id)
      .eq("is_deleted", false);
    existingQ = side == null ? existingQ.is("side", null) : existingQ.eq("side", side);
    const { data: existing } = await existingQ;

    if (!virtual) {
      const stale = (existing ?? []).filter((t) => !t.completed).map((t) => t.id);
      if (stale.length > 0) {
        await supabaseAdmin.from("tasks").update({ is_deleted: true }).in("id", stale);
      }
      return;
    }

    const haveTask = new Set((existing ?? []).map((t) => t.deal_id));
    const missing = dealIds.filter((d) => !haveTask.has(d));
    if (missing.length === 0) return;

    // Join the deal's milestone for this stage, unless it's already Completed
    // (/api/tasks would auto-complete the task).
    let msQ = supabaseAdmin
      .from("milestones")
      .select("id, deal_id, status")
      .in("deal_id", missing)
      .eq("stage_template_id", tpl.stage_template_id ?? "")
      .eq("is_deleted", false);
    msQ = side == null ? msQ : msQ.or(`side.eq.${side},side.is.null`);
    const { data: milestones } = tpl.stage_template_id ? await msQ : { data: [] };

    const rows = missing.map((dealId) => {
      const ms = (milestones ?? []).find((m) => m.deal_id === dealId && m.status !== "Completed");
      return {
        deal_id: dealId,
        side,
        task_template_id: tpl.id,
        title: tpl.name?.trim() || TREEFORT_TASK_TITLE,
        status: "Pending",
        completed: false,
        role_type: tpl.role_type ?? "client",
        is_shared: false,
        activation_required: false,
        milestone_id: ms?.id ?? null,
        order_index: tpl.order_index ?? null,
      };
    });
    const { error } = await supabaseAdmin.from("tasks").insert(rows);
    if (error) console.error("[Treefort] insert failed:", error.message);
  } catch (err) {
    console.error("[Treefort] sync failed:", err);
  }
}
