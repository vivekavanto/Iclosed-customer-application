import supabaseAdmin from "@/lib/supabaseAdmin";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";

export const ILA_TITLE_PREFIX = "Independent legal advice for ";

/** First name in "Independent legal advice for Alex". */
export function ilaName(title: string | null | undefined): string | null {
  const t = (title ?? "").trim();
  return t.toLowerCase().startsWith(ILA_TITLE_PREFIX.toLowerCase()) ? t.slice(ILA_TITLE_PREFIX.length).trim() || null : null;
}

/** Owners below the largest share. */
export function minorityOwners(shares: string): string[] {
  const rows = shares
    .split(";")
    .map((p) => p.trim().match(/^(.*?)\s*[—–-]?\s*([\d.]+)\s*%$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ name: m[1].trim(), pct: parseFloat(m[2]) || 0 }));
  if (rows.length < 2) return [];
  const max = Math.max(...rows.map((r) => r.pct));
  return rows.filter((r) => r.pct < max && r.name).map((r) => r.name);
}

// ILA task per minority owner on each family deal. Never throws.
export async function syncIlaTasks(holdTitleTaskId: string): Promise<void> {
  try {
    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("id, deal_id, side, milestone_id, task_template_id")
      .eq("id", holdTitleTaskId)
      .maybeSingle();
    if (!task?.deal_id) return;

    const { data: answers } = await supabaseAdmin
      .from("task_responses")
      .select("field_label, field_type, value")
      .eq("task_id", task.id);
    const tenantsInCommon = (answers ?? []).some((r) => /tenants in common/i.test(String(r.value ?? "")));
    const shares = (answers ?? []).find((r) => r.field_type === "shares")?.value ?? "";
    const wanted = tenantsInCommon ? minorityOwners(String(shares)).map((n) => n.split(/\s+/)[0]) : [];

    const { data: tpl } = await supabaseAdmin
      .from("task_templates")
      .select("id, order_index, role_type")
      .eq("lead_type", "Purchase")
      .ilike("name", "independent legal advice%")
      .eq("is_deleted", false)
      .limit(1)
      .maybeSingle();
    if (!tpl) {
      if (wanted.length) console.error("[ILA] No Purchase ILA template — run sql/add_ila_task.sql.");
      return;
    }

    const dealIds = [task.deal_id, ...(await getLinkedDealIds(task.deal_id))];
    let existingQ = supabaseAdmin
      .from("tasks")
      .select("id, deal_id, title, completed")
      .in("deal_id", dealIds)
      .eq("task_template_id", tpl.id)
      .eq("is_deleted", false);
    existingQ = task.side == null ? existingQ.is("side", null) : existingQ.eq("side", task.side);
    const { data: existing } = await existingQ;

    const { data: holdTitleTasks } = await supabaseAdmin
      .from("tasks")
      .select("deal_id, milestone_id")
      .in("deal_id", dealIds)
      .eq("task_template_id", task.task_template_id ?? "")
      .eq("is_deleted", false);
    const milestoneFor = (dealId: string) =>
      holdTitleTasks?.find((t) => t.deal_id === dealId)?.milestone_id ?? (dealId === task.deal_id ? task.milestone_id : null);

    const titles = wanted.map((n) => `${ILA_TITLE_PREFIX}${n}`);
    const stale = (existing ?? []).filter((t) => !t.completed && !titles.includes(t.title)).map((t) => t.id);
    if (stale.length) await supabaseAdmin.from("tasks").update({ is_deleted: true }).in("id", stale);

    const have = new Set((existing ?? []).map((t) => `${t.deal_id}|${t.title}`));
    const rows = dealIds.flatMap((dealId) =>
      titles
        .filter((title) => !have.has(`${dealId}|${title}`))
        .map((title) => ({
          deal_id: dealId,
          side: task.side ?? null,
          task_template_id: tpl.id,
          title,
          status: "Pending",
          completed: false,
          role_type: tpl.role_type ?? "client",
          is_shared: true,
          activation_required: false,
          milestone_id: milestoneFor(dealId),
          order_index: tpl.order_index ?? null,
        })),
    );
    if (rows.length) {
      const { error } = await supabaseAdmin.from("tasks").insert(rows);
      if (error) console.error("[ILA] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[ILA] sync failed:", err);
  }
}
