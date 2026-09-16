import supabaseAdmin from "@/lib/supabaseAdmin";
import { isUploadIdTask } from "@/lib/taskKinds";

export const SPOUSE_ID_DOC_TYPE = "spouse_identification";

export function normalizePersonName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Middle names may differ: first + last is enough.
export function isSamePersonName(a: string, b: string): boolean {
  const x = normalizePersonName(a);
  const y = normalizePersonName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xs = x.split(" ");
  const ys = y.split(" ");
  return (
    xs.length > 1 &&
    ys.length > 1 &&
    xs[0] === ys[0] &&
    xs[xs.length - 1] === ys[ys.length - 1]
  );
}

export function spouseNameFromResponses(
  responses: Array<{ field_type?: string; value?: unknown }>,
): string {
  const r = responses.find((x) => x?.field_type === "spouse");
  return typeof r?.value === "string" ? r.value.replace(/\s+/g, " ").trim() : "";
}

// Adds an ID task for a spouse not on the APS; retires this form's stale pending ones.
export async function syncSpouseIdTask(params: {
  personalInfoTaskId: string;
  dealId: string;
  side: "purchase" | "sale" | null;
  spouseName: string;
}): Promise<void> {
  const { personalInfoTaskId, dealId, side, spouseName } = params;
  try {
    let q = supabaseAdmin
      .from("tasks")
      .select("id, title, spouse_name, spouse_source_task_id, completed, milestone_id, order_index")
      .eq("deal_id", dealId)
      .eq("is_deleted", false);
    q = side == null ? q.is("side", null) : q.eq("side", side);
    const { data: dealTasks, error: tasksError } = await q;
    if (tasksError) {
      console.error("[SpouseIdTask] task lookup failed:", tasksError.message);
      return;
    }
    const tasks = dealTasks ?? [];
    const spouseTasks = tasks.filter((t) => t.spouse_name);

    const isParty = !!spouseName && (await isPartyOnSide(dealId, side, spouseName));
    const needsTask = !!spouseName && !isParty;
    console.log("[SpouseIdTask]", { dealId, side, spouseName, isParty });
    const keep = needsTask
      ? spouseTasks.find((t) => isSamePersonName(t.spouse_name, spouseName))
      : undefined;

    const stale = spouseTasks
      .filter(
        (t) =>
          t.spouse_source_task_id === personalInfoTaskId &&
          !t.completed &&
          t.id !== keep?.id,
      )
      .map((t) => t.id);
    if (stale.length > 0) {
      await supabaseAdmin.from("tasks").update({ is_deleted: true }).in("id", stale);
    }

    if (!needsTask || keep) return;

    const idTask = tasks.find((t) => !t.spouse_name && isUploadIdTask(t.title));
    // /api/tasks auto-completes tasks under a Completed milestone, so don't join one.
    let milestoneId: string | null = idTask?.milestone_id ?? null;
    if (milestoneId) {
      const { data: ms } = await supabaseAdmin
        .from("milestones")
        .select("status")
        .eq("id", milestoneId)
        .maybeSingle();
      if (ms?.status === "Completed") milestoneId = null;
    }
    const { error } = await supabaseAdmin.from("tasks").insert({
      deal_id: dealId,
      side,
      title: `${idTask?.title?.trim() || "Identification"} - ${spouseName}`,
      status: "Pending",
      completed: false,
      role_type: "client",
      is_shared: false,
      task_template_id: null,
      milestone_id: milestoneId,
      order_index: idTask?.order_index ?? null,
      spouse_name: spouseName,
      spouse_source_task_id: personalInfoTaskId,
    });
    // 23505: a concurrent submit already created it.
    if (error && error.code !== "23505") {
      console.error("[SpouseIdTask] insert failed:", error.message);
    } else if (!error) {
      console.log("[SpouseIdTask] created spouse ID task", { dealId, spouseName });
    }
  } catch (err) {
    console.error("[SpouseIdTask] sync failed:", err);
  }
}

async function isPartyOnSide(
  dealId: string,
  side: "purchase" | "sale" | null,
  name: string,
): Promise<boolean> {
  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select("lead_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal?.lead_id) return false;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id")
    .eq("id", deal.lead_id)
    .maybeSingle();
  const primaryId = lead?.parent_lead_id ?? lead?.id ?? deal.lead_id;

  const { data: family } = await supabaseAdmin
    .from("leads")
    .select("id, first_name, last_name, parent_lead_id, co_person_role")
    .or(`id.eq.${primaryId},parent_lead_id.eq.${primaryId}`);

  const sideRole = side === "purchase" ? "purchaser" : side === "sale" ? "seller" : null;
  return (family ?? []).some((m) => {
    const onSide =
      m.parent_lead_id == null ||
      !sideRole ||
      !m.co_person_role ||
      m.co_person_role === sideRole;
    return onSide && isSamePersonName(`${m.first_name ?? ""} ${m.last_name ?? ""}`, name);
  });
}
