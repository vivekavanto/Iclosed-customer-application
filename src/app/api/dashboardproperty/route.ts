import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // ── Resolve authenticated client ──────────────────────────
    const client = await getAuthClient();

    if (!client) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // ── Fetch ALL leads for this client (primary only, no co-persons) ──
    const { data: leads, error: leadError } = await supabaseAdmin
      .from("leads")
      .select(
        "id, first_name, last_name, email, phone, lead_type, address_street, address_city, address_province, address_postal_code, address_unit"
      )
      .eq("client_id", client.id)
      .is("parent_lead_id", null)
      .order("created_at", { ascending: false });

    if (leadError) {
      console.error("Lead fetch error:", leadError);
      return NextResponse.json({ success: false, error: "Lead fetch failed" });
    }

    // ── Fetch ALL deals for this client ───────────────────────
    const { data: deals, error: dealError } = await supabaseAdmin
      .from("deals")
      .select(
        "id, file_number, type, status, closing_date, property_address, price, lead_id"
      )
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    if (dealError) {
      console.error("Deal fetch error:", dealError);
      return NextResponse.json({ success: false, error: "Deal fetch failed" });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        success: true,
        properties: [],
        deals: deals ?? [],
      });
    }

    // ── Map deals by lead_id for quick lookup ─────────────────
    const dealsByLeadId: Record<string, (typeof deals)[0]> = {};
    for (const deal of deals ?? []) {
      if (deal.lead_id) {
        dealsByLeadId[deal.lead_id] = deal;
      }
    }

    // ── Build property for every lead (deal optional) ─────────
    const properties = leads.map((lead) => {
      const deal = dealsByLeadId[lead.id] ?? null;

      return {
        lead_id: lead.id,
        deal_id: deal?.id ?? null,
        address_street: deal?.property_address || lead.address_street || null,
        address_city: lead.address_city || null,
        address_province: lead.address_province || null,
        address_postal_code: lead.address_postal_code || null,
        address_unit: lead.address_unit || null,
        first_name: client.first_name || lead.first_name,
        last_name: client.last_name || lead.last_name,
        phone: client.phone || lead.phone || null,
        lead_type: lead.lead_type || deal?.type || null,
      };
    });

    return NextResponse.json({
      success: true,
      properties,
      deals: deals ?? [],
    });
  } catch (err) {
    console.error("GET /api/dashboardproperty error:", err);
    return NextResponse.json({ success: false, error: "Server error" });
  }
}
