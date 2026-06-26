import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";

export const dynamic = "force-dynamic";

/**
 * GET /api/on-behalf-targets?task_id=<taskId>
 *
 * Given a task the authenticated user is about to act on (Upload Identification /
 * Provide Personal Information), returns the list of people they may submit it
 * for: themselves PLUS every other member of the same transaction "family" whose
 * own deal has the equivalent task (same title + same side).
 *
 * The dropdown is offered only to the family's DESIGNATED UPLOADER — the member
 * whose `submit_on_behalf === true`. That uploader may be the primary ("Me") or a
 * co-purchaser/co-seller the primary delegated to ("My co-purchaser"). For anyone
 * who is not the designated uploader, a single (self-only) target is returned so
 * the drawer shows no dropdown.
 *
 * Security: the opened task must belong to a deal owned by the caller
 * (`deal.client_id === client.id`); family members are resolved strictly via the
 * shared primary id (`id = primary` OR `parent_lead_id = primary`) — never from
 * client-supplied ids.
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

    // ── The "self" lead: the lead behind the opened task (the caller's own) ──
    const { data: selfLead } = await supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name, parent_lead_id, submit_on_behalf, lead_type, co_person_role")
      .eq("id", deal.lead_id)
      .maybeSingle();

    const selfIsPrimary = !!selfLead && selfLead.parent_lead_id == null;
    const selfTarget = {
      lead_id: selfLead?.id ?? deal.lead_id,
      task_id: task.id,
      first_name: selfLead?.first_name ?? client.first_name ?? "",
      last_name: selfLead?.last_name ?? client.last_name ?? "",
      role_label: selfIsPrimary
        ? getPrimaryLabel(side, selfLead?.lead_type ?? deal.type ?? null)
        : getCoPersonLabel(selfLead?.co_person_role ?? null),
      is_primary: selfIsPrimary,
      is_self: true,
    };

    // ── The family: primary lead + all its co-persons ──
    // The designated uploader (submit_on_behalf === true) may be the primary OR a
    // co-person. Only that person may submit on the rest of the family's behalf.
    const primaryId = selfLead?.parent_lead_id ?? selfLead?.id ?? deal.lead_id;

    const { data: familyLeads } = await supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name, parent_lead_id, submit_on_behalf, lead_type, co_person_role")
      .or(`id.eq.${primaryId},parent_lead_id.eq.${primaryId}`);

    const uploader = (familyLeads ?? []).find((l) => l.submit_on_behalf === true);

    // The dropdown is only offered to the designated uploader, and only when they
    // are the one currently signed in (the opened task is theirs). Anyone else —
    // including the primary when they delegated to a co-person — submits only for
    // themselves, so no dropdown.
    if (!uploader || uploader.id !== selfTarget.lead_id) {
      return NextResponse.json({ success: true, enabled: false, targets: [selfTarget] });
    }

    // ── Every OTHER family member + their equivalent task ──
    const otherMembers = (familyLeads ?? []).filter((l) => l.id !== selfTarget.lead_id);
    const otherTargets: (typeof selfTarget)[] = [];

    for (const member of otherMembers) {
      const { data: memberDeal } = await supabaseAdmin
        .from("deals")
        .select("id")
        .eq("lead_id", member.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!memberDeal) continue;

      // Match the equivalent task on the member's own deal. The authoritative
      // cross-deal link is task_template_id (already side-specific — Purchase and
      // Sale templates are distinct rows), which is robust to any title drift.
      // Fall back to a same-side title match for legacy rows without a template
      // id. Prefer an incomplete copy if several exist.
      const baseQuery = () =>
        supabaseAdmin
          .from("tasks")
          .select("id, completed")
          .eq("deal_id", memberDeal.id)
          .eq("is_deleted", false)
          .order("completed", { ascending: true })
          .limit(1);

      let memberTask: { id: string; completed: boolean } | null = null;
      if (task.task_template_id) {
        const { data } = await baseQuery()
          .eq("task_template_id", task.task_template_id)
          .maybeSingle();
        memberTask = data ?? null;
      }
      if (!memberTask) {
        let q = baseQuery().ilike("title", task.title);
        q = side == null ? q.is("side", null) : q.eq("side", side);
        const { data } = await q.maybeSingle();
        memberTask = data ?? null;
      }
      if (!memberTask) continue;

      const memberIsPrimary = member.parent_lead_id == null;
      otherTargets.push({
        lead_id: member.id,
        task_id: memberTask.id,
        first_name: member.first_name ?? "",
        last_name: member.last_name ?? "",
        role_label: memberIsPrimary
          ? getPrimaryLabel(side, member.lead_type ?? deal.type ?? null)
          : getCoPersonLabel(member.co_person_role ?? null),
        is_primary: memberIsPrimary,
        is_self: false,
      });
    }

    return NextResponse.json({
      success: true,
      enabled: otherTargets.length > 0,
      targets: [selfTarget, ...otherTargets],
    });
  } catch (err) {
    console.error("GET /api/on-behalf-targets error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
