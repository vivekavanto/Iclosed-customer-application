import supabaseAdmin from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { syncSharedTaskCompletion, syncSharedTaskPatch } from "@/lib/syncSharedTask";
import { triggerMilestoneEmail } from "@/lib/triggerMilestoneEmail";

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
    if (task?.is_shared && task.task_template_id) {
      if (patch.completed) {
        // When completing: use syncSharedTaskCompletion which handles
        // marking complete + copying responses + advancing milestones.
        // Do NOT also call syncSharedTaskPatch — it would race and mark
        // linked tasks as completed before syncSharedTaskCompletion can
        // find them (queries WHERE completed=false).
        syncSharedTaskCompletion({
          taskId: task.id,
          dealId: task.deal_id,
          taskTemplateId: task.task_template_id,
        }).catch((err) => console.error("[SharedTaskSync] Error:", err));
      } else {
        // Non-completion updates (status change, document upload) — sync fields only
        syncSharedTaskPatch({
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
    if (task?.milestone_id && patch.completed) {
      const { data: siblingsData } = await supabaseAdmin
        .from("tasks")
        .select("id, completed")
        .eq("milestone_id", task.milestone_id);

      const siblings = siblingsData ?? [];
      const allDone = siblings.length > 0 && siblings.every((t) => t.completed);
      const anyDone = siblings.some((t) => t.completed);

      if (allDone) {
        // 3️⃣ All tasks done → mark milestone Completed
        await supabaseAdmin
          .from("milestones")
          .update({ status: "Completed", completed_at: new Date().toISOString() })
          .eq("id", task.milestone_id);

        // 3b. Trigger milestone email if it has an email_template_id
        triggerMilestoneEmail(task.milestone_id).catch((err) =>
          console.error("[MilestoneEmail] Trigger failed:", err)
        );

        // 4️⃣ Find next milestone → mark it In Progress
        const { data: currentMilestone } = await supabaseAdmin
          .from("milestones")
          .select("order_index")
          .eq("id", task.milestone_id)
          .single();

        if (currentMilestone) {
          const { data: nextMilestone } = await supabaseAdmin
            .from("milestones")
            .select("id")
            .eq("deal_id", task.deal_id)
            .gt("order_index", currentMilestone.order_index)
            .neq("status", "Completed")
            .order("order_index", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (nextMilestone) {
            await supabaseAdmin
              .from("milestones")
              .update({ status: "In Progress" })
              .eq("id", nextMilestone.id);

            // 5️⃣ Find the milestone after the next one → mark it "Waiting"
            const { data: waitingMilestone } = await supabaseAdmin
              .from("milestones")
              .select("id")
              .eq("deal_id", task.deal_id)
              .neq("id", nextMilestone.id)
              .neq("status", "Completed")
              .neq("status", "In Progress")
              .gt("order_index", currentMilestone.order_index)
              .order("order_index", { ascending: true })
              .limit(1)
              .maybeSingle();

            if (waitingMilestone) {
              await supabaseAdmin
                .from("milestones")
                .update({ status: "Waiting" })
                .eq("id", waitingMilestone.id);
            }
          }
        }
      } else if (anyDone) {
        // 3️⃣ Some tasks done → mark milestone In Progress
        await supabaseAdmin
          .from("milestones")
          .update({ status: "In Progress" })
          .eq("id", task.milestone_id)
          .neq("status", "Completed");
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/tasks/[id] error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
