import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeals } from "@/lib/getAuthClient";
import { isDepositTask, STATEMENT_OF_ACCOUNT_DOC_TYPE } from "@/lib/depositTask";

/**
 * GET /api/deposit-task?task_id=<uuid>
 *
 * The two things the closing-funds task needs that a task row alone can't give
 * the drawer:
 *
 *   • balance_due — the figure the admin entered from the Final Statement of
 *     Account. It IS on the task row (and so already in /api/tasks), but is
 *     returned here too so the drawer has one authoritative read at open time
 *     rather than trusting a list fetched minutes ago: this number is the amount
 *     a purchaser is about to wire.
 *   • the statement itself — a `lead_corporate_docs` row filed against the
 *     family's primary lead, which the task row knows nothing about.
 *
 * Ownership is re-derived here rather than trusted from the caller, the same way
 * /api/documents/download does it: the task must sit on a deal belonging to the
 * logged-in client's own family.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const taskId = new URL(req.url).searchParams.get("task_id");
  if (!taskId) {
    return NextResponse.json({ success: false, error: "task_id is required" }, { status: 400 });
  }

  const auth = await getAuthClientDeals();
  if (!auth?.client) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const clientLeadIds = (auth.deals ?? [])
    .map((d) => d.lead_id)
    .filter((x): x is string => !!x);
  if (clientLeadIds.length === 0) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  // The client's families: every lead sharing a root with one of their own.
  const { data: ownLeads } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id")
    .in("id", clientLeadIds);

  const rootIds = Array.from(new Set((ownLeads ?? []).map((l) => l.parent_lead_id ?? l.id)));
  if (rootIds.length === 0) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const { data: familyLeads } = await supabaseAdmin
    .from("leads")
    .select("id")
    .or(rootIds.map((r) => `id.eq.${r},parent_lead_id.eq.${r}`).join(","));

  const allowedLeadIds = (familyLeads ?? []).map((l) => l.id as string);
  if (allowedLeadIds.length === 0) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const { data: task } = await supabaseAdmin
    .from("tasks")
    .select("id, title, deal_id, balance_due, activation_required, activated_at")
    .eq("id", taskId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (!task || !isDepositTask(task.title)) {
    return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
  }

  // The task's own deal must belong to the client's family.
  const { data: taskDeal } = await supabaseAdmin
    .from("deals")
    .select("lead_id")
    .eq("id", task.deal_id)
    .maybeSingle();

  if (!taskDeal?.lead_id || !allowedLeadIds.includes(taskDeal.lead_id)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  // The balance is a property of the FILE, and an admin enters it once — on the
  // primary deal's row. A co-purchaser's own copy of the shared task can be
  // created later (by the self-heal in /api/tasks) and carry no figure at all,
  // so fall back to whichever row in the family has one rather than showing
  // them a blank amount to wire.
  let balanceDue: number | null =
    task.balance_due === null || task.balance_due === undefined
      ? null
      : Number(task.balance_due);

  if (balanceDue === null) {
    const { data: familyDeals } = await supabaseAdmin
      .from("deals")
      .select("id")
      .in("lead_id", allowedLeadIds)
      .eq("is_deleted", false);

    const familyDealIds = (familyDeals ?? []).map((d) => d.id as string);
    if (familyDealIds.length > 0) {
      const { data: peers } = await supabaseAdmin
        .from("tasks")
        .select("balance_due, title")
        .in("deal_id", familyDealIds)
        .eq("is_deleted", false)
        .not("balance_due", "is", null);

      const peer = (peers ?? []).find((p) => isDepositTask(p.title));
      if (peer?.balance_due !== null && peer?.balance_due !== undefined) {
        balanceDue = Number(peer.balance_due);
      }
    }
  }

  // The statement is filed against the primary lead, so look across the whole
  // family — a co-purchaser opening the task must see the same document.
  const { data: docs } = await supabaseAdmin
    .from("lead_corporate_docs")
    .select("id, file_name, file_url, created_at")
    .in("lead_id", allowedLeadIds)
    .eq("doc_type", STATEMENT_OF_ACCOUNT_DOC_TYPE)
    .order("created_at", { ascending: false })
    .limit(1);

  return NextResponse.json({
    success: true,
    balance_due: balanceDue,
    statement: docs?.[0] ?? null,
  });
}
