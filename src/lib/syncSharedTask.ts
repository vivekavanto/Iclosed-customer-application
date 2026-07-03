import supabaseAdmin from "@/lib/supabaseAdmin";
import { triggerMilestoneEmail } from "@/lib/triggerMilestoneEmail";
import { findFamilySharedTaskPeers, isApsTemplate } from "@/lib/findFamilySharedTaskPeers";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";

/**
 * Helper: resolves the source task's title + APS-ness so the peer lookup can
 * fall back to a title match for cross-side mirroring (Purchase ↔ Sale).
 */
async function resolveSourceTaskMeta(taskId: string): Promise<{
  title: string | null;
  isApsTask: boolean;
}> {
  const { data: task } = await supabaseAdmin
    .from("tasks")
    .select("title, task_template_id")
    .eq("id", taskId)
    .maybeSingle();
  const title = task?.title ?? null;
  const isApsTask = await isApsTemplate(task?.task_template_id ?? null);
  return { title, isApsTask };
}

/**
 * When a shared task is completed, sync it to all linked deals.
 * Copies task_responses and marks the matching task as completed.
 */
export async function syncSharedTaskCompletion(params: {
  taskId: string;
  dealId: string;
  taskTemplateId: string;
}): Promise<void> {
  const { taskId, dealId, taskTemplateId } = params;

  // Side-isolated peer lookup: matches by task_template_id AND (non-APS) by
  // case-insensitive title within the SAME side, so same-side parties stay in
  // lockstep but Purchase/Sale copies of a task never cross-complete.
  const { title, isApsTask } = await resolveSourceTaskMeta(taskId);
  const peers = await findFamilySharedTaskPeers({
    sourceTaskId: taskId,
    dealId,
    taskTemplateId,
    title,
    isApsTask,
  });
  if (peers.length === 0) return;

  // Only mirror to peers that aren't already completed (matches previous behaviour)
  const peerIds = peers.map((p) => p.id);
  const { data: openLinked } = await supabaseAdmin
    .from("tasks")
    .select("id, deal_id, milestone_id")
    .in("id", peerIds)
    .eq("completed", false)
    .eq("is_deleted", false);

  const linkedTasks = openLinked ?? [];
  if (linkedTasks.length === 0) return;

  // Get source task responses to copy
  const { data: sourceResponses } = await supabaseAdmin
    .from("task_responses")
    .select("field_label, field_type, value, file_url, file_name")
    .eq("task_id", taskId);

  for (const linkedTask of linkedTasks) {
    // Mark the linked task as completed
    await supabaseAdmin
      .from("tasks")
      .update({
        completed: true,
        status: "Completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", linkedTask.id);

    // Copy task responses (match by field_label since field_ids differ across deals)
    if (sourceResponses && sourceResponses.length > 0) {
      // Delete any existing responses on the linked task
      await supabaseAdmin.from("task_responses").delete().eq("task_id", linkedTask.id);

      const responseRows = sourceResponses.map((r) => ({
        task_id: linkedTask.id,
        field_label: r.field_label,
        field_type: r.field_type,
        value: r.value,
        file_url: r.file_url,
        file_name: r.file_name,
      }));

      await supabaseAdmin.from("task_responses").insert(responseRows);
    }

    // Advance milestone status for the linked task
    if (linkedTask.milestone_id) {
      await advanceMilestone(linkedTask.deal_id, linkedTask.milestone_id);
    }
  }
}

/**
 * When a shared task's responses are saved (draft or resubmit), sync responses
 * to all linked deals without changing completion state.
 */
export async function syncSharedTaskResponses(params: {
  taskId: string;
  dealId: string;
  taskTemplateId: string;
}): Promise<void> {
  const { taskId, dealId, taskTemplateId } = params;

  // Side-isolated peer lookup — see syncSharedTaskCompletion above.
  const { title, isApsTask } = await resolveSourceTaskMeta(taskId);
  const peers = await findFamilySharedTaskPeers({
    sourceTaskId: taskId,
    dealId,
    taskTemplateId,
    title,
    isApsTask,
  });
  if (peers.length === 0) return;

  const linkedTasks = peers.map((p) => ({ id: p.id }));

  // Get source task responses to copy
  const { data: sourceResponses } = await supabaseAdmin
    .from("task_responses")
    .select("field_label, field_type, value, file_url, file_name")
    .eq("task_id", taskId);

  for (const linkedTask of linkedTasks) {
    await supabaseAdmin.from("task_responses").delete().eq("task_id", linkedTask.id);

    if (sourceResponses && sourceResponses.length > 0) {
      const responseRows = sourceResponses.map((r) => ({
        task_id: linkedTask.id,
        field_label: r.field_label,
        field_type: r.field_type,
        value: r.value,
        file_url: r.file_url,
        file_name: r.file_name,
      }));

      await supabaseAdmin.from("task_responses").insert(responseRows);
    }
  }
}

/**
 * Sync non-response fields for a shared task (e.g. status/document_url) to all
 * linked deals' matching tasks (same task_template_id).
 */
export async function syncSharedTaskPatch(params: {
  sourceTaskId: string;
  dealId: string;
  taskTemplateId: string;
  patch: {
    status?: string;
    completed?: boolean;
    completed_at?: string | null;
    document_url?: string | null;
    document_name?: string | null;
  };
}): Promise<void> {
  const { sourceTaskId, dealId, taskTemplateId, patch } = params;

  // Side-isolated peer lookup — matches title-equivalent shared tasks on the
  // SAME side of a Purchase & Sale family. Purchase and Sale copies stay
  // independent. APS keeps its template-id-only scope.
  const { title, isApsTask } = await resolveSourceTaskMeta(sourceTaskId);
  const peers = await findFamilySharedTaskPeers({
    sourceTaskId,
    dealId,
    taskTemplateId,
    title,
    isApsTask,
  });
  if (peers.length === 0) return;

  await supabaseAdmin
    .from("tasks")
    .update(patch)
    .in("id", peers.map((p) => p.id));
}

/**
 * Family-aware milestone advancement.
 *
 * A milestone completes ONLY when every party on the file has finished their
 * copy of every task in it. Each family member (primary + co-persons) has their
 * own deal with its own milestone rows, but the copies share a stable identity:
 * `stage_template_id` + `side`. So we resolve the equivalent milestone on every
 * family deal and only mark the whole set Completed once ALL of their tasks are
 * done — then advance each deal's next milestone in lockstep. This prevents one
 * person's milestone flipping to "done" while a co-person still owes an upload.
 *
 * Not-yet-complete calls still reflect local progress: if any of THIS deal's own
 * tasks in the milestone are done, it moves to "In Progress" (never Completed).
 *
 * Idempotent: an already-Completed milestone is skipped, so the milestone email
 * fires at most once per family milestone.
 */
export async function advanceMilestone(dealId: string, milestoneId: string) {
  const { data: ms } = await supabaseAdmin
    .from("milestones")
    .select("id, deal_id, stage_template_id, side, order_index")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!ms) return;

  const side = (ms.side ?? null) as "purchase" | "sale" | null;

  // The equivalent milestone on every family deal (same stage_template_id +
  // side). Legacy rows with no stage_template_id fall back to per-deal.
  const familyDealIds = [dealId, ...(await getLinkedDealIds(dealId))];
  let equivalents: Array<{ id: string; deal_id: string; order_index: number }> = [];
  if (ms.stage_template_id) {
    let q = supabaseAdmin
      .from("milestones")
      .select("id, deal_id, order_index")
      .in("deal_id", familyDealIds)
      .eq("stage_template_id", ms.stage_template_id)
      .eq("is_deleted", false);
    q = side === null ? q.is("side", null) : q.eq("side", side);
    const { data } = await q;
    equivalents = data ?? [];
  }
  if (equivalents.length === 0) {
    equivalents = [{ id: ms.id, deal_id: ms.deal_id, order_index: ms.order_index }];
  }

  // Family-wide completion: every task under ANY equivalent milestone (i.e.
  // every party's copy of every task in this milestone) must be complete.
  const { data: tasksData } = await supabaseAdmin
    .from("tasks")
    .select("id, completed, milestone_id")
    .in("milestone_id", equivalents.map((m) => m.id))
    .eq("is_deleted", false);
  const tasks = tasksData ?? [];
  const familyAllDone = tasks.length > 0 && tasks.every((t) => t.completed);

  if (familyAllDone) {
    for (const em of equivalents) {
      // Only NEWLY-completing rows fire the email + advance the next milestone.
      const { data: completed } = await supabaseAdmin
        .from("milestones")
        .update({ status: "Completed", completed_at: new Date().toISOString() })
        .eq("id", em.id)
        .neq("status", "Completed")
        .select("id");
      if (!completed || completed.length === 0) continue;

      triggerMilestoneEmail(em.id).catch((err) =>
        console.error("[MilestoneEmail] Trigger failed:", err)
      );

      await advanceToNextMilestone(em.deal_id, side, em.order_index);
    }
    return;
  }

  // Not family-complete yet — reflect local progress only. If any of THIS deal's
  // own tasks are done, the milestone is In Progress (but never Completed).
  const anyLocalDone = tasks.some(
    (t) => t.completed && t.milestone_id === milestoneId
  );
  if (anyLocalDone) {
    await supabaseAdmin
      .from("milestones")
      .update({ status: "In Progress" })
      .eq("id", milestoneId)
      .neq("status", "Completed");
  }
}

/**
 * Move the given deal's next milestone (same side) to "In Progress". Kept in a
 * helper so family-aware completion can advance every party's timeline.
 */
async function advanceToNextMilestone(
  dealId: string,
  side: "purchase" | "sale" | null,
  fromOrderIndex: number
) {
  const nextQuery = supabaseAdmin
    .from("milestones")
    .select("id")
    .eq("deal_id", dealId)
    .eq("is_deleted", false)
    .gt("order_index", fromOrderIndex)
    .neq("status", "Completed")
    .order("order_index", { ascending: true })
    .limit(1);
  const { data: nextMs } =
    side === null
      ? await nextQuery.is("side", null).maybeSingle()
      : await nextQuery.eq("side", side).maybeSingle();

  if (nextMs) {
    await supabaseAdmin
      .from("milestones")
      .update({ status: "In Progress" })
      .eq("id", nextMs.id)
      .neq("status", "Completed");
  }
}
