import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";
import { getFamilyTaskRoster } from "@/lib/familyTaskTargets";
import { getFamilyUploadMode } from "@/lib/getFamilyUploadMode";
import { isUploadIdTask, REQUIRED_ID_DOCS } from "@/lib/taskKinds";

export const dynamic = "force-dynamic";

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

    // Who may the caller (self) edit? Their own section always; everyone else only
    // when they're the family's designated uploader (me/co) or the family chose
    // "both" (anyone acts for anyone). Mirrors /api/on-behalf-targets.
    const mode = await getFamilyUploadMode(roster.selfLeadId);
    const callerMayActForOthers =
      mode === "both" || roster.uploaderLeadId === roster.selfLeadId;

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

    const members = roster.members.map((m) => ({
      lead_id: m.lead_id,
      task_id: m.task_id,
      name: `${m.first_name} ${m.last_name}`.trim(),
      first_name: m.first_name,
      last_name: m.last_name,
      role_label: m.role_label,
      is_primary: m.is_primary,
      is_self: m.is_self,
      // Only the designated uploader (or "both" mode) may edit/submit
      // per-party sections. Previously the caller could always edit their
      // own row; restrict that so non-uploaders see a status instead of a
      // an actionable "Provide/Upload" button.
      can_edit: callerMayActForOthers,
      completed: m.completed,
      ...(isIdTask
        ? { doc_count: docCounts[m.lead_id] ?? 0, doc_total: REQUIRED_ID_DOCS }
        : {}),
    }));

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
