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

    // Fetch all existing retainer signatures for the user's leads
    const { data: signatures } = await supabaseAdmin
      .from("retainer_signatures")
      .select("lead_id")
      .in("lead_id", leadIds);

    const signedLeadIds = new Set((signatures || []).map((s) => s.lead_id));
    const unsignedLeadId = leadIds.find((id) => !signedLeadIds.has(id));

    // All deals are signed
    if (!unsignedLeadId) {
      return NextResponse.json({ signed: true });
    }

    // Fetch lead details for the unsigned deal
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("first_name, last_name, lead_type, address_street, address_city, address_province, address_postal_code")
      .eq("id", unsignedLeadId)
      .single();

    const fullName = lead
      ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim()
      : "";

    const addressParts = lead
      ? [
          lead.address_street,
          lead.address_city,
          lead.address_province,
          lead.address_postal_code,
        ].filter(Boolean).join(", ")
      : "";

    return NextResponse.json({
      signed: false,
      full_name: fullName,
      signed_date: new Date().toISOString().split("T")[0],
      property_address: addressParts,
      lead_type: lead?.lead_type ?? "",
    });
  } catch (err: any) {
    console.error("[Retainer Check] Server error:", err);
    return NextResponse.json(
      { signed: false, error: "Server error" },
      { status: 500 }
    );
  }
}
