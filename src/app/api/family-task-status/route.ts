import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";
import { getFamilyTaskRoster } from "@/lib/familyTaskTargets";
import { getFamilyUploadMode } from "@/lib/getFamilyUploadMode";
import { isUploadIdTask, REQUIRED_ID_DOCS } from "@/lib/taskKinds";
import { SPOUSE_ID_DOC_TYPE } from "@/lib/spouseIdTask";

export const dynamic = "force-dynamic";

type StatusMember = {
  lead_id: string;
  task_id: string | null;
  name: string;
  first_name: string;
  last_name: string;
  role_label: string;
  is_primary: boolean;
  is_self: boolean;
  can_edit: boolean;
  completed: boolean;
  doc_count?: number;
  doc_total?: number;
  spouse_name?: string | null;
};

async function spouseMembers(
  side: "purchase" | "sale" | null,
  parties: StatusMember[],
): Promise<Array<{ after_task_id: string; member: StatusMember }>> {
  const partyTaskIds = parties.map((m) => m.task_id).filter((id): id is string => !!id);
  if (partyTaskIds.length === 0) return [];

  const { data: partyTasks } = await supabaseAdmin
    .from("tasks")
    .select("id, deal_id")
    .in("id", partyTaskIds);
  const partyByDeal = new Map<string, StatusMember>();
  for (const t of partyTasks ?? []) {
    const party = parties.find((m) => m.task_id === t.id);
    if (party) partyByDeal.set(t.deal_id, party);
  }
  if (partyByDeal.size === 0) return [];

  let q = supabaseAdmin
    .from("tasks")
    .select("id, deal_id, spouse_name, completed")
    .in("deal_id", [...partyByDeal.keys()])
    .not("spouse_name", "is", null)
    .eq("is_deleted", false);
  q = side == null ? q.is("side", null) : q.eq("side", side);
  const { data: spouseTasks, error } = await q;
  if (error || !spouseTasks?.length) return [];

  const { data: docs } = await supabaseAdmin
    .from("lead_corporate_docs")
    .select("task_id")
    .eq("doc_type", SPOUSE_ID_DOC_TYPE)
    .in("task_id", spouseTasks.map((t) => t.id));
  const docCounts: Record<string, number> = {};
  for (const d of docs ?? []) {
    if (d.task_id) docCounts[d.task_id] = (docCounts[d.task_id] ?? 0) + 1;
  }

  return spouseTasks.flatMap((t) => {
    const party = partyByDeal.get(t.deal_id);
    if (!party?.task_id) return [];
    const name = String(t.spouse_name ?? "").trim();
    const [first = "", ...rest] = name.split(/\s+/);
    return [{
      after_task_id: party.task_id,
      member: {
        lead_id: party.lead_id,
        task_id: t.id,
        name,
        first_name: first,
        last_name: rest.join(" "),
        role_label: "Spouse",
        is_primary: false,
        is_self: false,
        can_edit: party.can_edit,
        completed: !!t.completed,
        doc_count: docCounts[t.id] ?? 0,
        doc_total: REQUIRED_ID_DOCS,
        spouse_name: name,
      },
    }];
  });
}

/**
 * GET /api/family-task-status?task_id=<taskId>
 *
 * For a per-party task (Personal Information / Upload Identification) on a deal
 * with co-persons, returns every involved party's copy status so the dashboard
 * can render "1 of 2 complete", "Pending Sara", "Sara 0/2", etc.
 *
 * The task is considered done for the deal only when EVERY party's copy is
 * complete (`all_completed`). For Upload Identification each member also carries
 * `doc_count` / `doc_total` (uploaded identification documents toward the
 * required two), powering the "X/2" badge.
 *
 * Security: the opened task must belong to a deal owned by the caller. Family
 * members are resolved via the shared primary id inside getFamilyTaskRoster.
 */
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

    const roster = await getFamilyTaskRoster(taskId);
    if (!roster) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }
    if (roster.deal.client_id !== client.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const isIdTask = isUploadIdTask(roster.task.title);

    // Who may the caller (self) edit? The family's designated uploader (me/co)
    // may edit every party's section. In "both" mode each party uploads only
    // their own — no one acts for the others. Mirrors /api/on-behalf-targets.
    const mode = await getFamilyUploadMode(roster.selfLeadId);
    const callerIsUploader = roster.uploaderLeadId === roster.selfLeadId;

    // For Upload ID, count each party's uploaded identification documents.
    const docCounts: Record<string, number> = {};
    if (isIdTask) {
      const leadIds = roster.members.map((m) => m.lead_id);
      const { data: docs } = await supabaseAdmin
        .from("lead_corporate_docs")
        .select("lead_id")
        .in("lead_id", leadIds)
        .eq("doc_type", "identification");
      for (const d of docs ?? []) {
        docCounts[d.lead_id] = (docCounts[d.lead_id] ?? 0) + 1;
      }
    }

    const members: StatusMember[] = roster.members.map((m) => ({
      lead_id: m.lead_id,
      task_id: m.task_id,
      name: `${m.first_name} ${m.last_name}`.trim(),
      first_name: m.first_name,
      last_name: m.last_name,
      role_label: m.role_label,
      is_primary: m.is_primary,
      is_self: m.is_self,
      // The designated uploader may edit every party's section. In "both" mode
      // each party may edit only their own row. Non-uploaders in me/co mode see
      // a status instead of an actionable "Provide/Upload" button.
      can_edit: callerIsUploader || (mode === "both" && m.is_self),
      completed: m.completed,
      ...(isIdTask
        ? { doc_count: docCounts[m.lead_id] ?? 0, doc_total: REQUIRED_ID_DOCS }
        : {}),
    }));

    if (isIdTask) {
      const spouseRows = await spouseMembers(roster.task.side, members);
      for (const row of spouseRows.reverse()) {
        const at = members.findIndex((m) => m.task_id === row.after_task_id);
        members.splice(at + 1, 0, row.member);
      }
    }

    const all_completed = members.every((m) => m.completed);
    const completed_count = members.filter((m) => m.completed).length;

    return NextResponse.json({
      success: true,
      task_id: roster.task.id,
      title: roster.task.title,
      is_id_task: isIdTask,
      is_multi_party: members.length > 1,
      all_completed,
      completed_count,
      total_count: members.length,
      members,
    });
  } catch (err) {
    console.error("GET /api/family-task-status error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
