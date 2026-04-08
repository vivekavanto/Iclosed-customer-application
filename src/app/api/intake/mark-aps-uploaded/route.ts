import supabaseAdmin from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { lead_id } = await req.json();

    if (!lead_id) {
      return NextResponse.json({ success: false, error: "Missing lead_id" }, { status: 400 });
    }

    await supabaseAdmin
      .from("leads")
      .update({ aps_uploaded: true })
      .eq("id", lead_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/intake/mark-aps-uploaded error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
