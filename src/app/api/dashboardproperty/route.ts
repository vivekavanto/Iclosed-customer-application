import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lead_id = searchParams.get("lead_id");

    if (lead_id) {
      // Fetch the lead + its associated deal (if exists)
      const { data: lead, error: leadError } = await supabaseAdmin
        .from("leads")
        .select("id, first_name, last_name, address_street, address_city, address_province, address_unit, lead_type, price")
        .eq("id", lead_id)
        .maybeSingle();

      if (leadError) {
        return NextResponse.json({ success: false, error: leadError.message });
      }

      if (!lead) {
        return NextResponse.json({ success: false, error: "Lead not found" });
      }

      // Try to find associated deal
      const { data: deal } = await supabaseAdmin
        .from("deals")
        .select("id, file_number, type, status, closing_date, property_address, price")
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

    // Fallback — latest lead (for backwards compat)
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("address_street, address_city, address_province")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }

    return NextResponse.json({ success: true, property: data, deal: null });
  } catch (err) {
    console.error("GET /api/dashboardproperty error:", err);
    return NextResponse.json({ success: false, error: "Server error" });
  }
}