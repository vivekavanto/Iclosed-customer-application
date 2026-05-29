import supabaseAdmin from "@/lib/supabaseAdmin";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";


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
