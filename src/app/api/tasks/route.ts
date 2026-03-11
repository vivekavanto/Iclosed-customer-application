import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeal } from "@/lib/getAuthClient";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // ── Primary: use authenticated session ───────────────────
    const authData = await getAuthClientDeal();

    // ── Fallback: use lead_id from query param (for testing) ─
    const lead_id = searchParams.get("lead_id");
    const deal_id = searchParams.get("deal_id");

    let resolvedDealId: string | null = authData?.deal?.id ?? deal_id ?? null;

    // If auth session has no deal and lead_id is provided, resolve via lead
    if (!resolvedDealId && lead_id) {
      const { data: deal } = await supabaseAdmin
        .from("deals")
        .select("id")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedDealId = deal?.id ?? null;
    }

    if (!resolvedDealId) {
      return NextResponse.json({ success: true, tasks: [], deal_id: null });
    }

    // Fetch tasks for this deal
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
      .eq("deal_id", resolvedDealId)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (tasksError) {
      return NextResponse.json({ success: false, error: tasksError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, tasks: tasks ?? [], deal_id: resolvedDealId });
  } catch (err) {
    console.error("GET /api/tasks error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
