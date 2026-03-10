import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/leads
 * Returns all leads, ordered newest first.
 * Called by the admin panel to populate the Leads Dashboard.
 */
export async function GET() {
  try {
    const { data: leads, error } = await supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name, email, phone, lead_type, address_street, address_city, address_postal_code, status, price, created_at, is_corporate, corporate_name, inc_number")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, leads: leads ?? [] });
  } catch (err) {
    console.error("GET /api/admin/leads error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

