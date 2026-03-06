import supabaseAdmin from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lead_id = searchParams.get("lead_id");
    const deal_id = searchParams.get("deal_id");

    // ── If lead_id provided: resolve to deal first ──
    if (lead_id) {
      // 1. Find the deal for this lead
      const { data: deal, error: dealError } = await supabaseAdmin
        .from("deals")
        .select("id")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dealError) {
        return NextResponse.json({ success: false, error: dealError.message }, { status: 400 });
      }

      if (!deal) {
        // No deal yet — return empty tasks (admin hasn't converted lead yet)
        return NextResponse.json({ success: true, tasks: [], deal_id: null });
      }

      // 2. Fetch tasks for this deal, including milestone info
      const { data: tasks, error: tasksError } = await supabaseAdmin
        .from("tasks")
        .select(`
          *,
          milestones (
            id,
            title,
            order_index,
            status
          )
        `)
        .eq("deal_id", deal.id)
        .order("due_date", { ascending: true, nullsFirst: false });

      if (tasksError) {
        return NextResponse.json({ success: false, error: tasksError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, tasks: tasks ?? [], deal_id: deal.id });
    }

    // ── Fallback: filter by deal_id directly ──
    let query = supabaseAdmin
      .from("tasks")
      .select(`
        *,
        milestones (
          id,
          title,
          order_index,
          status
        )
      `)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (deal_id) {
      query = query.eq("deal_id", deal_id);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, tasks: data ?? [], deal_id: deal_id ?? null });
  } catch (err) {
    console.error("GET /api/tasks error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/tasks/:id  — mark task complete
export async function PATCH(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.pathname.split("/").pop();

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing task id" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("tasks")
      .update({ completed: true, status: "Completed", completed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/tasks error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
