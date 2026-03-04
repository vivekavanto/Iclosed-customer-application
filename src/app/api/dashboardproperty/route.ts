import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("address_street, address_city, address_province")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }

    return NextResponse.json({ success: true, property: data });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Server error" });
  }
}