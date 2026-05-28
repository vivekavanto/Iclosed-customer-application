import supabaseAdmin from "@/lib/supabaseAdmin";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";

/**
 * Resolves the set of `tasks.id`s that should be kept in lockstep with a given
 * shared task across the deal's co-purchaser / co-seller family.
 *
 * Why this exists: shared tasks are mirrored by `task_template_id`, but a
 * Purchase-side template and a Sale-side template have different ids. So for
 * Purchase & Sale deals the template-id match never crosses sides, and
 * co-sellers never receive sync updates for tasks like "Status of Mortgage",
 * "Upload Home Insurance Policy", or "Schedule an Appointment". Falling back
 * to a case-insensitive title match within the same family fixes this without
 * changing the data model.
 *
 * APS is intentionally excluded from the title fallback — it has dedicated
 * side-scoped completion logic in the admin's completeApsTask.
 *
 * Returns peer task ids (excludes the source task itself).
 */
export async function findFamilySharedTaskPeers(params: {
  sourceTaskId: string;
  dealId: string;
  taskTemplateId: string | null;
  title: string | null;
  isApsTask: boolean;
}): Promise<Array<{ id: string; deal_id: string; milestone_id: string | null }>> {
  const { sourceTaskId, dealId, taskTemplateId, title, isApsTask } = params;

  const linkedDealIds = await getLinkedDealIds(dealId);
  if (linkedDealIds.length === 0) return [];

  const peers = new Map<string, { id: string; deal_id: string; milestone_id: string | null }>();

  if (taskTemplateId) {
    const { data: byTemplate } = await supabaseAdmin
      .from("tasks")
      .select("id, deal_id, milestone_id")
      .in("deal_id", linkedDealIds)
      .eq("task_template_id", taskTemplateId)
      .eq("is_shared", true);
    for (const t of byTemplate ?? []) {
      if (t.id !== sourceTaskId) peers.set(t.id, t);
    }
  }

  const trimmedTitle = title?.trim();
  if (!isApsTask && trimmedTitle) {
    const { data: byTitle } = await supabaseAdmin
      .from("tasks")
      .select("id, deal_id, milestone_id")
      .in("deal_id", linkedDealIds)
      .ilike("title", trimmedTitle)
      .eq("is_shared", true);
    for (const t of byTitle ?? []) {
      if (t.id !== sourceTaskId) peers.set(t.id, t);
    }
  }

  return [...peers.values()];
}

/**
 * Looks up whether a given task_template_id is the APS template.
 * Returns false when no template is provided or the lookup fails.
 */
export async function isApsTemplate(taskTemplateId: string | null | undefined): Promise<boolean> {
  if (!taskTemplateId) return false;
  const { data } = await supabaseAdmin
    .from("task_templates")
    .select("is_aps_task")
    .eq("id", taskTemplateId)
    .maybeSingle();
  return Boolean(data?.is_aps_task);
}
