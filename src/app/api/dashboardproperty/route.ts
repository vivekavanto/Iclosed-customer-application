import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeal } from "@/lib/getAuthClient";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // ── Primary: use authenticated session ───────────────────
    const authData = await getAuthClientDeal();

    // ── Fallback: use lead_id query param ─────────────────────
    const lead_id = searchParams.get("lead_id");

    // If auth session exists, return from client + deal directly
    if (authData?.deal) {
      const deal = authData.deal;
      const client = authData.client;

      // Get lead for address details
      const { data: lead } = deal.lead_id
        ? await supabaseAdmin
            .from("leads")
            .select("address_street, address_city, address_province, address_unit, lead_type")
            .eq("id", deal.lead_id)
            .maybeSingle()
        : { data: null };

      return NextResponse.json({
        success: true,
        property: {
          address_street: deal.property_address || lead?.address_street || null,
          address_city: lead?.address_city || null,
          address_province: lead?.address_province || null,
          address_unit: lead?.address_unit || null,
          first_name: client.first_name,
          last_name: client.last_name,
          lead_type: lead?.lead_type || deal.type || null,
        },
        deal,
      });
    }

    // ── Fallback: resolve via lead_id ─────────────────────────
    if (lead_id) {
      const { data: lead, error: leadError } = await supabaseAdmin
        .from("leads")
        .select("id, first_name, last_name, address_street, address_city, address_province, address_unit, lead_type")
        .eq("id", lead_id)
        .maybeSingle();

      if (leadError || !lead) {
        return NextResponse.json({ success: false, error: "Lead not found" });
      }

      const { data: deal } = await supabaseAdmin
        .from("deals")
        .select("id, file_number, type, status, closing_date, property_address, price, lead_id")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return NextResponse.json({
        success: true,
        property: {
          address_street: deal?.property_address || lead.address_street,
          address_city: lead.address_city,
          address_province: lead.address_province,
          address_unit: lead.address_unit,
          first_name: lead.first_name,
          last_name: lead.last_name,
          lead_type: lead.lead_type,
        },
        deal: deal ?? null,
      });
    }

    return NextResponse.json({ success: false, error: "Not authenticated and no lead_id provided" }, { status: 401 });
  } catch (err) {
    console.error("GET /api/dashboardproperty error:", err);
    return NextResponse.json({ success: false, error: "Server error" });
  }
}