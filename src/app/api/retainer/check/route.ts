import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";

/**
 * GET /api/retainer/check
 *
 * Checks if the authenticated user has signed the retainer agreement.
 * Returns { signed: true/false }
 */
export async function GET() {
  try {
    const client = await getAuthClient();
    if (!client) {
      return NextResponse.json(
        { signed: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Find the user's lead(s) via deals
    const { data: deals } = await supabaseAdmin
      .from("deals")
      .select("lead_id")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    const leadIds = (deals || []).map((d) => d.lead_id).filter(Boolean);

    if (leadIds.length === 0) {
      return NextResponse.json({ signed: false });
    }

    // Check if any lead has a retainer signature
    const { data: signatures } = await supabaseAdmin
      .from("retainer_signatures")
      .select("id")
      .in("lead_id", leadIds)
      .limit(1);

    return NextResponse.json({
      signed: signatures !== null && signatures.length > 0,
    });
  } catch (err: any) {
    console.error("[Retainer Check] Server error:", err);
    return NextResponse.json(
      { signed: false, error: "Server error" },
      { status: 500 }
    );
  }
}
