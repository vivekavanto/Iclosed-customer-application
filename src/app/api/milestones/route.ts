import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeal } from "@/lib/getAuthClient";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lead_id = searchParams.get("lead_id");
    const deal_id = searchParams.get("deal_id");

    const authData = await getAuthClientDeal();

    let dealIds: string[] = [];

    // ─────────────────────────────────────────
    // 1️⃣ AUTHENTICATED CLIENT
    // client_id → ALL deals
    // ─────────────────────────────────────────
    if (authData?.client) {
      const { data: deals } = await supabaseAdmin
        .from("deals")
        .select("id")
        .eq("client_id", authData.client.id);

      dealIds = (deals ?? []).map((d: any) => d.id);
    }

    // ─────────────────────────────────────────
    // 2️⃣ LEAD LOGIN FLOW
    // lead_id → client_id → deals
    // ─────────────────────────────────────────
    if (!dealIds.length && lead_id) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("client_id")
        .eq("id", lead_id)
        .maybeSingle();

      if (lead?.client_id) {
        const { data: deals } = await supabaseAdmin
          .from("deals")
          .select("id")
          .eq("client_id", lead.client_id);

        dealIds = (deals ?? []).map((d: any) => d.id);
      }

      // fallback → deals directly linked to lead
      if (!dealIds.length) {
        const { data: deals } = await supabaseAdmin
          .from("deals")
          .select("id")
          .eq("lead_id", lead_id);

        dealIds = (deals ?? []).map((d: any) => d.id);
      }
    }

    // ─────────────────────────────────────────
    // 3️⃣ Optional deal filter
    // ─────────────────────────────────────────
    if (deal_id) {
      dealIds = [deal_id];
    }

    if (!dealIds.length) {
      return NextResponse.json({ success: true, milestones: [] });
    }

    // ─────────────────────────────────────────
    // Fetch milestones + tasks
    // ─────────────────────────────────────────
    const [{ data: milestones, error: msError }, { data: tasks }] =
      await Promise.all([
        supabaseAdmin
          .from("milestones")
          .select(
            "id, title, status, milestone_date, order_index, completed_at, deal_id"
          )
          .in("deal_id", dealIds)
          .order("order_index", { ascending: true }),

        supabaseAdmin
          .from("tasks")
          .select("id, milestone_id, completed")
          .in("deal_id", dealIds),
      ]);

    if (msError) {
      return NextResponse.json(
        { success: false, error: msError.message },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────
    // Count tasks per milestone
    // ─────────────────────────────────────────
    const enriched = (milestones ?? []).map((m: any) => {
      const mTasks = (tasks ?? []).filter(
        (t: any) => t.milestone_id === m.id
      );

      return {
        id: m.id,
        title: m.title,
        status: m.status,
        milestone_date: m.milestone_date,
        order_index: m.order_index,
        completed_at: m.completed_at,
        deal_id: m.deal_id,
        total_tasks: mTasks.length,
        completed_tasks: mTasks.filter((t: any) => t.completed).length,
      };
    });

    return NextResponse.json({
      success: true,
      milestones: enriched,
      deal_ids: dealIds,
    });
  } catch (err) {
    console.error("GET /api/milestones error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}