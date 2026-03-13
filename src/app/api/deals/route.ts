import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeals } from "@/lib/getAuthClient";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lead_id = searchParams.get("lead_id");

    // ── Primary: authenticated session → all deals ────────────
    const authData = await getAuthClientDeals();

    if (authData && authData.deals.length > 0) {
      const { client, deals } = authData;

      // Fetch all lead records for address details in one query
      const leadIds = deals.map((d) => d.lead_id).filter(Boolean) as string[];
      const { data: leads } = leadIds.length
        ? await supabaseAdmin
            .from("leads")
            .select("id, address_street, address_city, address_province, address_postal_code, address_unit, lead_type, phone")
            .in("id", leadIds)
        : { data: [] };

      const leadMap = Object.fromEntries((leads ?? []).map((l: any) => [l.id, l]));

      const enriched = deals.map((deal: any) => {
        const lead = deal.lead_id ? leadMap[deal.lead_id] : null;
        return {
          id: deal.id,
          file_number: deal.file_number,
          type: deal.type,
          status: deal.status,
          closing_date: deal.closing_date,
          price: deal.price,
          lead_id: deal.lead_id,
          address_street: deal.property_address || lead?.address_street || null,
          address_city: lead?.address_city || null,
          address_province: lead?.address_province || null,
          address_postal_code: lead?.address_postal_code || null,
          address_unit: lead?.address_unit || null,
          lead_type: lead?.lead_type || deal.type || null,
          first_name: client.first_name,
          last_name: client.last_name,
          phone: client.phone || lead?.phone || null,
        };
      });

      return NextResponse.json({ success: true, deals: enriched });
    }

    // ── Fallback: email param → find client → all their deals ─
    const email = searchParams.get("email");
    if (email) {
      const { data: clientByEmail } = await supabaseAdmin
        .from("clients")
        .select("id, first_name, last_name, phone")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (clientByEmail) {
        const { data: deals } = await supabaseAdmin
          .from("deals")
          .select("id, file_number, type, status, closing_date, property_address, price, lead_id")
          .eq("client_id", clientByEmail.id)
          .order("created_at", { ascending: false });

        const leadIds = (deals ?? []).map((d: any) => d.lead_id).filter(Boolean) as string[];
        const { data: leads } = leadIds.length
          ? await supabaseAdmin
              .from("leads")
              .select("id, address_street, address_city, address_province, address_postal_code, address_unit, lead_type, phone")
              .in("id", leadIds)
          : { data: [] };

        const leadMap = Object.fromEntries((leads ?? []).map((l: any) => [l.id, l]));

        const enriched = (deals ?? []).map((deal: any) => {
          const lead = deal.lead_id ? leadMap[deal.lead_id] : null;
          return {
            id: deal.id,
            file_number: deal.file_number,
            type: deal.type,
            status: deal.status,
            closing_date: deal.closing_date,
            price: deal.price,
            lead_id: deal.lead_id,
            address_street: deal.property_address || lead?.address_street || null,
            address_city: lead?.address_city || null,
            address_province: lead?.address_province || null,
            address_postal_code: lead?.address_postal_code || null,
            address_unit: lead?.address_unit || null,
            lead_type: lead?.lead_type || deal.type || null,
            first_name: clientByEmail.first_name,
            last_name: clientByEmail.last_name,
            phone: clientByEmail.phone || lead?.phone || null,
          };
        });

        return NextResponse.json({ success: true, deals: enriched });
      }
    }

    // ── Fallback: lead_id → single lead's deals ───────────────
    if (lead_id) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id, first_name, last_name, phone, address_street, address_city, address_province, address_postal_code, address_unit, lead_type")
        .eq("id", lead_id)
        .maybeSingle();

      if (!lead) {
        return NextResponse.json({ success: true, deals: [] });
      }

      const { data: deals } = await supabaseAdmin
        .from("deals")
        .select("id, file_number, type, status, closing_date, property_address, price, lead_id")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false });

      const enriched = (deals ?? []).map((deal: any) => ({
        id: deal.id,
        file_number: deal.file_number,
        type: deal.type,
        status: deal.status,
        closing_date: deal.closing_date,
        price: deal.price,
        lead_id: deal.lead_id,
        address_street: deal.property_address || lead.address_street || null,
        address_city: lead.address_city,
        address_province: lead.address_province,
        address_postal_code: lead.address_postal_code,
        address_unit: lead.address_unit,
        lead_type: lead.lead_type,
        first_name: lead.first_name,
        last_name: lead.last_name,
        phone: lead.phone,
      }));

      return NextResponse.json({ success: true, deals: enriched });
    }

    return NextResponse.json({ success: true, deals: [] });
  } catch (err) {
    console.error("GET /api/deals error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
