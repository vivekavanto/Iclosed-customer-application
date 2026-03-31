import supabaseAdmin from "@/lib/supabaseAdmin";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";

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

  const linkedDealIds = await getLinkedDealIds(dealId);
  if (linkedDealIds.length === 0) return;

  // Find matching tasks on linked deals (same template, not yet completed)
  const { data: linkedTasks } = await supabaseAdmin
    .from("tasks")
    .select("id, deal_id, milestone_id")
    .in("deal_id", linkedDealIds)
    .eq("task_template_id", taskTemplateId)
    .eq("completed", false);

  if (!linkedTasks || linkedTasks.length === 0) return;

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
 * Check milestone completion and advance to next milestone if all tasks done.
 */
async function advanceMilestone(dealId: string, milestoneId: string) {
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

    // Find and advance next milestone
    const { data: currentMs } = await supabaseAdmin
      .from("milestones")
      .select("order_index")
      .eq("id", milestoneId)
      .single();

    if (currentMs) {
      const { data: nextMs } = await supabaseAdmin
        .from("milestones")
        .select("id")
        .eq("deal_id", dealId)
        .gt("order_index", currentMs.order_index)
        .neq("status", "Completed")
        .order("order_index", { ascending: true })
        .limit(1)
        .maybeSingle();

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
