import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

/**
 * POST /api/task-responses
 *
 * Saves form responses for a task.
 * Body: {
 *   task_id: string,
 *   responses: Array<{
 *     field_id?: string,
 *     field_label: string,
 *     field_type: string,
 *     value?: string,
 *     file_url?: string,
 *     file_name?: string,
 *   }>
 * }
 *
 * File uploads are handled separately via /api/uploadblobstorage.
 * Only the resulting URL is stored here.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { task_id, responses, draft } = body;

    if (!task_id || !Array.isArray(responses) || responses.length === 0) {
      return NextResponse.json(
        { success: false, error: "task_id and responses[] are required" },
        { status: 400 }
      );
    }

    // Delete any existing responses for this task (full re-submit / overwrite)
    await supabaseAdmin.from("task_responses").delete().eq("task_id", task_id);

    // Insert all responses
    const rows = responses.map((r: any) => ({
      task_id,
      field_id: r.field_id ?? null,
      field_label: r.field_label,
      field_type: r.field_type,
      value: r.value ?? null,
      file_url: r.file_url ?? null,
      file_name: r.file_name ?? null,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("task_responses")
      .insert(rows);

    if (insertError) {
      return NextResponse.json({ success: false, error: insertError.message }, { status: 400 });
    }

    // If draft, save responses only — do NOT mark task as completed
    if (draft) {
      return NextResponse.json({ success: true, draft: true });
    }

    // Auto-mark the task as completed on submit
    const { data: task, error: taskFetchError } = await supabaseAdmin
      .from("tasks")
      .select("id, deal_id, milestone_id")
      .eq("id", task_id)
      .single();

    if (!taskFetchError && task) {
      await supabaseAdmin
        .from("tasks")
        .update({ completed: true, status: "Completed", completed_at: new Date().toISOString() })
        .eq("id", task_id);

      // Check if all tasks in the milestone are now completed
      if (task.milestone_id) {
        const { data: siblings } = await supabaseAdmin
          .from("tasks")
          .select("id, completed")
          .eq("milestone_id", task.milestone_id);

        // Re-fetch to get updated state after marking this task done
        const { data: updatedSiblings } = await supabaseAdmin
          .from("tasks")
          .select("id, completed")
          .eq("milestone_id", task.milestone_id);

        const allDone =
          (updatedSiblings ?? []).length > 0 &&
          (updatedSiblings ?? []).every((t: any) => t.completed || t.id === task_id);

        if (allDone) {
          await supabaseAdmin
            .from("milestones")
            .update({ status: "Completed", completed_at: new Date().toISOString() })
            .eq("id", task.milestone_id);

          // Advance next milestone to In Progress
          const { data: currentMs } = await supabaseAdmin
            .from("milestones")
            .select("order_index")
            .eq("id", task.milestone_id)
            .single();

          if (currentMs) {
            const { data: nextMs } = await supabaseAdmin
              .from("milestones")
              .select("id")
              .eq("deal_id", task.deal_id)
              .gt("order_index", currentMs.order_index)
              .neq("status", "Completed")
              .order("order_index", { ascending: true })
              .limit(1)
              .maybeSingle();

            if (nextMs) {
              await supabaseAdmin
                .from("milestones")
                .update({ status: "In Progress" })
                .eq("id", nextMs.id);
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/task-responses error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

/**
 * GET /api/task-responses?task_id=xxx
 * Returns all saved responses for a task.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const task_id = searchParams.get("task_id");

    if (!task_id) {
      return NextResponse.json({ success: false, error: "task_id is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("task_responses")
      .select("*")
      .eq("task_id", task_id)
      .order("submitted_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, responses: data ?? [] });
  } catch (err) {
    console.error("GET /api/task-responses error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
