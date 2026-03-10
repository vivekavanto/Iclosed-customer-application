import supabaseAdmin from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1️⃣ Mark the task as completed
    const { data: task, error: taskError } = await supabaseAdmin
      .from("tasks")
      .update({
        completed: true,
        status: "Completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, deal_id, milestone_id")
      .single();

    if (taskError) {
      return NextResponse.json({ success: false, error: taskError.message }, { status: 400 });
    }

    // 2️⃣ If task belongs to a milestone → check if ALL tasks in that milestone are completed
    if (task?.milestone_id) {
      const { data: siblingsData } = await supabaseAdmin
        .from("tasks")
        .select("id, completed")
        .eq("milestone_id", task.milestone_id);

      const siblings = siblingsData ?? [];
      const allDone = siblings.length > 0 && siblings.every((t) => t.completed);

      if (allDone) {
        // 3️⃣ Mark this milestone as Completed
        await supabaseAdmin
          .from("milestones")
          .update({
            status: "Completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", task.milestone_id);

        // 4️⃣ Find the next milestone in this deal (next order_index) → mark it In Progress
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
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/tasks/[id] error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
