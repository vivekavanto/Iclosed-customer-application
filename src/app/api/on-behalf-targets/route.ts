import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";

export const dynamic = "force-dynamic";

/**
 * GET /api/on-behalf-targets?task_id=<primaryTaskId>
 *
 * Given a task the authenticated primary is about to act on (Upload
 * Identification / Provide Personal Information), returns the list of people the
 * primary may submit it for: themselves PLUS any linked co-purchaser/co-seller
 * whose own deal has the equivalent task (same title + same side).
 *
 * Used to render the "Submitting for …" dropdown inside the drawer. Gated on the
 * primary lead's `submit_on_behalf === true`; when off (or no co-persons), a
 * single (primary-only) target is returned so the drawer shows no dropdown.
 *
 * Security: the opened task must belong to a deal owned by the caller
 * (`deal.client_id === client.id`); co-persons are resolved strictly via
 * `parent_lead_id = the primary lead` — never from client-supplied ids.
 */

function getCoPersonLabel(role: string | null): string {
  if (role === "purchaser") return "Co-Purchaser";
  if (role === "seller") return "Co-Seller";
  return "Co-Applicant";
}

function getPrimaryLabel(
  side: "purchase" | "sale" | null,
  leadType: string | null
): string {
  if (side === "purchase") return "Primary Purchaser";
  if (side === "sale") return "Primary Seller";
  const lt = (leadType ?? "").toLowerCase();
  const isCombined = lt.includes("purchase") && lt.includes("sale");
  if (!isCombined && lt.includes("sale")) return "Primary Seller";
  if (!isCombined && lt.includes("purchase")) return "Primary Purchaser";
  return "Primary Applicant";
}

export async function GET(req: Request) {
  try {
    const client = await getAuthClient();
    if (!client) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("task_id");
    if (!taskId) {
      return NextResponse.json({ success: false, error: "task_id is required" }, { status: 400 });
    }

    // ── The opened task + its deal ──
    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("id, title, side, deal_id, task_template_id")
      .eq("id", taskId)
      .maybeSingle();
    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    const { data: deal } = await supabaseAdmin
      .from("deals")
      .select("id, client_id, lead_id, type")
      .eq("id", task.deal_id)
      .maybeSingle();

    // Ownership guard — the caller must own the deal this task belongs to.
    if (!deal || deal.client_id !== client.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const side = (task.side ?? null) as "purchase" | "sale" | null;

    // ── The primary lead behind this deal ──
    const { data: primaryLead } = await supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name, parent_lead_id, submit_on_behalf, lead_type")
      .eq("id", deal.lead_id)
      .maybeSingle();

    const primaryTarget = {
      lead_id: primaryLead?.id ?? deal.lead_id,
      task_id: task.id,
      first_name: primaryLead?.first_name ?? client.first_name ?? "",
      last_name: primaryLead?.last_name ?? client.last_name ?? "",
      role_label: getPrimaryLabel(side, primaryLead?.lead_type ?? deal.type ?? null),
      is_primary: true,
    };

    // Only a true primary (no parent) who opted in can submit on others' behalf.
    if (
      !primaryLead ||
      primaryLead.parent_lead_id != null ||
      primaryLead.submit_on_behalf !== true
    ) {
      return NextResponse.json({ success: true, enabled: false, targets: [primaryTarget] });
    }

    // ── Co-persons + their equivalent task ──
    const { data: coPersonLeads } = await supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name, co_person_role")
      .eq("parent_lead_id", primaryLead.id);

    const coTargets: typeof primaryTarget[] = [];

    for (const co of coPersonLeads ?? []) {
      const { data: coDeal } = await supabaseAdmin
        .from("deals")
        .select("id")
        .eq("lead_id", co.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!coDeal) continue;

      // Match the equivalent task on the co-person's own deal. The authoritative
      // cross-deal link is task_template_id (already side-specific — Purchase and
      // Sale templates are distinct rows), which is robust to any title drift.
      // Fall back to a same-side title match for legacy rows without a template
      // id. Prefer an incomplete copy if several exist.
      const baseQuery = () =>
        supabaseAdmin
          .from("tasks")
          .select("id, completed")
          .eq("deal_id", coDeal.id)
          .eq("is_deleted", false)
          .order("completed", { ascending: true })
          .limit(1);

      let coTask: { id: string; completed: boolean } | null = null;
      if (task.task_template_id) {
        const { data } = await baseQuery()
          .eq("task_template_id", task.task_template_id)
          .maybeSingle();
        coTask = data ?? null;
      }
      if (!coTask) {
        let q = baseQuery().ilike("title", task.title);
        q = side == null ? q.is("side", null) : q.eq("side", side);
        const { data } = await q.maybeSingle();
        coTask = data ?? null;
      }
      if (!coTask) continue;

      coTargets.push({
        lead_id: co.id,
        task_id: coTask.id,
        first_name: co.first_name ?? "",
        last_name: co.last_name ?? "",
        role_label: getCoPersonLabel(co.co_person_role),
        is_primary: false,
      });
    }

    return NextResponse.json({
      success: true,
      enabled: coTargets.length > 0,
      targets: [primaryTarget, ...coTargets],
    });
  } catch (err) {
    console.error("GET /api/on-behalf-targets error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
