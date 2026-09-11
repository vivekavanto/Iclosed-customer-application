import supabaseAdmin from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { syncSharedTaskCompletion, syncSharedTaskPatch, advanceMilestone } from "@/lib/syncSharedTask";
import { requestAllTasksCompleteAlert } from "@/lib/requestAllTasksCompleteAlert";
import { notifyClientTaskCompleted } from "@/lib/notifyTaskCompleted";

// This route can reach the email transport, and the SMTP provider uses
// nodemailer — which needs raw TCP and CANNOT run on the Edge runtime.
// Resend never exposed this because it is an HTTPS fetch client.
export const runtime = "nodejs";


export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Optional body: allow status/document updates while keeping old behavior.
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const bodyObj = (body && typeof body === "object") ? (body as Record<string, unknown>) : null;
    const incomingStatus = typeof bodyObj?.status === "string" ? bodyObj.status : null;
    const incomingCompleted = typeof bodyObj?.completed === "boolean" ? bodyObj.completed : null;
    const incomingDocUrl = typeof bodyObj?.document_url === "string" ? bodyObj.document_url : null;
    const incomingDocName = typeof bodyObj?.document_name === "string" ? bodyObj.document_name : null;

    const markCompleted = incomingCompleted ?? (incomingStatus === "Completed" ? true : null) ?? true;

    const patch: Record<string, any> = {
      status: incomingStatus ?? "Completed",
      completed: markCompleted,
    };

    if (markCompleted) {
      patch.completed_at = new Date().toISOString();
    }
    if (incomingDocUrl !== null) patch.document_url = incomingDocUrl;
    if (incomingDocName !== null) patch.document_name = incomingDocName;

    // Read the task's state BEFORE the update: the "client completed a task"
    // alert must fire on the Pending → Completed transition only, so re-opening
    // a finished task and re-saving it doesn't email the office again.
    const { data: prior } = await supabaseAdmin
      .from("tasks")
      .select("completed, status, title")
      .eq("id", id)
      .maybeSingle();
    const wasCompleted = prior?.completed === true || prior?.status === "Completed";

    // 1️⃣ Update the task
    const { data: task, error: taskError } = await supabaseAdmin
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select("id, deal_id, milestone_id, is_shared, task_template_id")
      .single();

    if (taskError) {
      return NextResponse.json({ success: false, error: taskError.message }, { status: 400 });
    }

    // 1b. Sync shared task to linked deals (co-purchaser)
    // The promise is captured so the admin "all tasks complete" ping below can
    // wait for the mirror to land — pinging first would let the admin read a
    // family whose peer tasks are still Pending and conclude nothing's finished.
    let sharedSync: Promise<unknown> = Promise.resolve();
    if (task?.is_shared && task.task_template_id) {
      if (patch.completed) {
        // When completing: use syncSharedTaskCompletion which handles
        // marking complete + copying responses + advancing milestones.
        // Do NOT also call syncSharedTaskPatch — it would race and mark
        // linked tasks as completed before syncSharedTaskCompletion can
        // find them (queries WHERE completed=false).
        sharedSync = syncSharedTaskCompletion({
          taskId: task.id,
          dealId: task.deal_id,
          taskTemplateId: task.task_template_id,
        }).catch((err) => console.error("[SharedTaskSync] Error:", err));
      } else {
        // Non-completion updates (status change, document upload) — sync fields only
        syncSharedTaskPatch({
          sourceTaskId: task.id,
          dealId: task.deal_id,
          taskTemplateId: task.task_template_id,
          patch: {
            status: patch.status,
            completed: patch.completed,
            completed_at: patch.completed_at ?? null,
            document_url: patch.document_url ?? null,
            document_name: patch.document_name ?? null,
          },
        }).catch((err) => console.error("[SharedTaskSync] Error:", err));
      }
    }

    // 2️⃣ If task belongs to a milestone → update milestone status
    // Family-aware milestone advancement — completes only when EVERY party on
    // the file has finished this milestone's tasks, and advances each party's
    // timeline in lockstep. See advanceMilestone in syncSharedTask.
    if (task?.milestone_id && patch.completed) {
      await advanceMilestone(task.deal_id, task.milestone_id);
    }

    // 3️⃣ If this client AND their co-party have now finished everything on the
    // file, alert the back office (email to every admin + in-app notification).
    // Runs on every completion; the helper decides whether the family is
    // genuinely done and holds a shared idempotency claim, so it's a cheap
    // no-op otherwise and can never double-send. Never throws.
    //
    // sharedSync is awaited first: it mirrors this completion onto the family's
    // peer tasks, and checking before it lands would read peers as still
    // Pending and conclude nothing had finished.
    if (patch.completed && task?.deal_id) {
      await sharedSync;

      // Per-task alert first: the office wants to know THIS task landed even on
      // a file that still has outstanding work. Silent when the task was
      // already complete, so a re-save doesn't re-notify.
      await notifyClientTaskCompleted({
        taskId: task.id,
        dealId: task.deal_id,
        taskTitle: prior?.title ?? null,
        wasCompleted,
        source: "tasks-patch",
      });

      // Routed through the admin app so the alert carries the file's documents;
      // falls back to sending from here if it can't be reached.
      await requestAllTasksCompleteAlert(task.deal_id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/tasks/[id] error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
