import supabaseAdmin from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const deal_id = searchParams.get("deal_id");

    let query = supabaseAdmin
      .from("tasks")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false });

    if (deal_id) {
      query = query.eq("deal_id", deal_id);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, tasks: data });
  } catch (err) {
    console.error("GET /api/tasks error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
