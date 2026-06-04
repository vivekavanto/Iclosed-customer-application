import supabaseAdmin from "@/lib/supabaseAdmin";
import { triggerMilestoneEmail } from "@/lib/triggerMilestoneEmail";
import { findFamilySharedTaskPeers, isApsTemplate } from "@/lib/findFamilySharedTaskPeers";

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
    .eq("completed", false);

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
 * Check milestone completion and advance to next milestone if all tasks done.
 */
export async function advanceMilestone(dealId: string, milestoneId: string) {
  const { data: siblings } = await supabaseAdmin
    .from("tasks")
    .select("id, completed")
    .eq("milestone_id", milestoneId);

  const allDone = (siblings ?? []).length > 0 && (siblings ?? []).every((t) => t.completed);
  const anyDone = (siblings ?? []).some((t) => t.completed);

  if (allDone) {
    await supabaseAdmin
      .from("milestones")
      .update({ status: "Completed", completed_at: new Date().toISOString() })
      .eq("id", milestoneId);

    // Trigger milestone email for co-purchaser's milestone
    triggerMilestoneEmail(milestoneId).catch((err) =>
      console.error("[MilestoneEmail] Co-purchaser trigger failed:", err)
    );

    // Find and advance next milestone — must stay on the same side for
    // Purchase & Sale deals so the two timelines progress independently.
    const { data: currentMs } = await supabaseAdmin
      .from("milestones")
      .select("order_index, side")
      .eq("id", milestoneId)
      .single();

    if (currentMs) {
      const nextQuery = supabaseAdmin
        .from("milestones")
        .select("id")
        .eq("deal_id", dealId)
        .gt("order_index", currentMs.order_index)
        .neq("status", "Completed")
        .order("order_index", { ascending: true })
        .limit(1);
      const { data: nextMs } = currentMs.side === null
        ? await nextQuery.is("side", null).maybeSingle()
        : await nextQuery.eq("side", currentMs.side).maybeSingle();

      if (nextMs) {
        await supabaseAdmin
          .from("milestones")
          .update({ status: "In Progress" })
          .eq("id", nextMs.id);
      }
    }
  } else if (anyDone) {
    await supabaseAdmin
      .from("milestones")
      .update({ status: "In Progress" })
      .eq("id", milestoneId)
      .neq("status", "Completed");
  }
}
