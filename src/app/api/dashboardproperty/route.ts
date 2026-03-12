import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeal } from "@/lib/getAuthClient";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lead_id = searchParams.get("lead_id");

    // ─────────────────────────────────────────
    // 1️⃣ AUTHENTICATED CLIENT FLOW
    // client_id → fetch all deals
    // ─────────────────────────────────────────
    const authData = await getAuthClientDeal();

    if (authData?.client) {
      const client = authData.client;

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

      if (!deals || deals.length === 0) {
        return NextResponse.json({
          success: true,
          properties: [],
          deals: [],
        });
      }

      const properties = await Promise.all(
        deals.map(async (deal) => {
          let lead = null;

          if (deal.lead_id) {
            const { data } = await supabaseAdmin
              .from("leads")
              .select(
                "address_street, address_city, address_province, address_unit, address_postal_code, lead_type, phone"
              )
              .eq("id", deal.lead_id)
              .maybeSingle();

            lead = data;
          }

          return {
            deal_id: deal.id,
            address_street:
              deal.property_address || lead?.address_street || null,
            address_city: lead?.address_city || null,
            address_province: lead?.address_province || null,
            address_postal_code: lead?.address_postal_code || null,
            address_unit: lead?.address_unit || null,
            first_name: client.first_name,
            last_name: client.last_name,
            phone: client.phone || lead?.phone || null,
            lead_type: lead?.lead_type || deal.type || null,
          };
        })
      );

      return NextResponse.json({
        success: true,
        properties,
        deals,
      });
    }

    // ─────────────────────────────────────────
    // 2️⃣ LEAD LOGIN FLOW
    // lead_id → client_id → deals
    // ─────────────────────────────────────────
    if (lead_id) {
      const { data: lead, error: leadError } = await supabaseAdmin
        .from("leads")
        .select(
          "id, client_id, first_name, last_name, phone, address_street, address_city, address_province, address_postal_code, address_unit, lead_type"
        )
        .eq("id", lead_id)
        .maybeSingle();

      if (leadError || !lead) {
        return NextResponse.json({ success: false, error: "Lead not found" });
      }

      let deals: any[] = [];

      // 1️⃣ If client_id exists → get deals by client_id
      if (lead.client_id) {
        const { data } = await supabaseAdmin
          .from("deals")
          .select(
            "id, file_number, type, status, closing_date, property_address, price, lead_id"
          )
          .eq("client_id", lead.client_id)
          .order("created_at", { ascending: false });

        deals = data || [];
      }

      // 2️⃣ Fallback to deals linked directly to lead
      if (!deals.length) {
        const { data } = await supabaseAdmin
          .from("deals")
          .select(
            "id, file_number, type, status, closing_date, property_address, price, lead_id"
          )
          .eq("lead_id", lead_id)
          .order("created_at", { ascending: false });

        deals = data || [];
      }

      if (!deals.length) {
        return NextResponse.json({
          success: true,
          properties: [],
          deals: [],
        });
      }

      const properties = deals.map((deal) => ({
        deal_id: deal.id,
        address_street: deal.property_address || lead.address_street,
        address_city: lead.address_city,
        address_province: lead.address_province,
        address_postal_code: lead.address_postal_code,
        address_unit: lead.address_unit,
        first_name: lead.first_name,
        last_name: lead.last_name,
        phone: lead.phone,
        lead_type: lead.lead_type,
      }));

      return NextResponse.json({
        success: true,
        properties,
        deals,
      });
    }

    return NextResponse.json(
      { success: false, error: "Not authenticated and no lead_id provided" },
      { status: 401 }
    );
  } catch (err) {
    console.error("GET /api/dashboardproperty error:", err);
    return NextResponse.json({ success: false, error: "Server error" });
  }
}