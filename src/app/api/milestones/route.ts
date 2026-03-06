import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lead_id = searchParams.get("lead_id");
    const deal_id = searchParams.get("deal_id");

    let resolvedDealId: string | null = deal_id;

    // Resolve deal_id from lead_id if needed
    if (!resolvedDealId && lead_id) {
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

      resolvedDealId = deal?.id ?? null;
    }

    if (!resolvedDealId) {
      // No deal yet — return empty milestones
      return NextResponse.json({ success: true, milestones: [] });
    }

    // Fetch milestones with task counts
    const { data: milestones, error: msError } = await supabaseAdmin
      .from("milestones")
      .select(`
        id,
        title,
        status,
        milestone_date,
        order_index,
        completed_at,
        tasks (
          id,
          completed
        )
      `)
      .eq("deal_id", resolvedDealId)
      .order("order_index", { ascending: true });

    if (msError) {
      return NextResponse.json({ success: false, error: msError.message }, { status: 400 });
    }

    // Calculate progress for each milestone
    const enriched = (milestones ?? []).map((m: any) => {
      const total = m.tasks?.length ?? 0;
      const completed = m.tasks?.filter((t: any) => t.completed).length ?? 0;
      return {
        id: m.id,
        title: m.title,
        status: m.status,
        milestone_date: m.milestone_date,
        order_index: m.order_index,
        completed_at: m.completed_at,
        total_tasks: total,
        completed_tasks: completed,
      };
    });

    return NextResponse.json({ success: true, milestones: enriched });
  } catch (err) {
    console.error("GET /api/milestones error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
