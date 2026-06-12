import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";

export const dynamic = "force-dynamic";

/**
 * The single side a co-person is party to on a Purchase & Sale deal:
 *   co-purchaser → "purchase", co-seller → "sale".
 * Returns null for a primary client (sees both sides).
 *
 * Prefers the explicit `co_person_role`. For older co-person leads created
 * before that column was populated, falls back to the lead's own single-sided
 * `lead_type` ("Purchase" → purchase, "Sale" → sale). A co-person whose role is
 * null AND whose lead_type is the combined "Purchase & Sale" is genuinely
 * ambiguous → null (shows both; needs the role backfilled in admin).
 */
function recipientSideForLead(lead: {
  parent_lead_id: string | null;
  co_person_role: string | null;
  lead_type: string | null;
}): "purchase" | "sale" | null {
  if (!lead.parent_lead_id) return null; // primary client — both sides
  if (lead.co_person_role === "purchaser") return "purchase";
  if (lead.co_person_role === "seller") return "sale";
  const lt = (lead.lead_type ?? "").toLowerCase();
  const isCombined = lt.includes("purchase") && lt.includes("sale");
  if (!isCombined && lt.includes("sale")) return "sale";
  if (!isCombined && lt.includes("purchase")) return "purchase";
  return null;
}

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

    console.log(`[dashboardproperty] Resolved client: ${client.id} (${client.email})`);

    // ── Fetch ALL leads for this client ──
    const { data: allLeads, error: leadError } = await supabaseAdmin
      .from("leads")
      .select(
        "id, first_name, last_name, email, phone, lead_type, address_street, address_city, address_province, address_postal_code, address_unit, selling_address_street, selling_address_unit, selling_address_city, selling_address_postal_code, selling_address_province, parent_lead_id, co_person_role"
      )
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    if (leadError) {
      console.error("Lead fetch error:", leadError);
      return NextResponse.json({ success: false, error: "Lead fetch failed" });
    }

    // ── Filter out same-client co-person leads (added via intake form) ──
    // Keep: primary leads (no parent) + co-purchaser leads (parent belongs to different client)
    let leads = allLeads ?? [];
    const coPersonLeads = leads.filter((l) => l.parent_lead_id);
    if (coPersonLeads.length > 0) {
      const parentIds = [...new Set(coPersonLeads.map((l) => l.parent_lead_id))];
      const { data: parentLeads } = await supabaseAdmin
        .from("leads")
        .select("id, client_id")
        .in("id", parentIds);

      const sameClientParentIds = new Set(
        (parentLeads ?? [])
          .filter((p) => p.client_id === client.id)
          .map((p) => p.id)
      );

      leads = leads.filter(
        (l) => !l.parent_lead_id || !sameClientParentIds.has(l.parent_lead_id)
      );
    }

    console.log(`[dashboardproperty] Leads after filter: ${leads.length}`, leads.map(l => ({ id: l.id, email: l.email, parent_lead_id: l.parent_lead_id })));

    // ── Fetch ACTIVE deals for this client ────────────────────
    // Dashboard only surfaces deals the client can still act on.
    const { data: deals, error: dealError } = await supabaseAdmin
      .from("deals")
      .select(
        "id, file_number, type, status, closing_date, property_address, price, selling_price, selling_property_address, lead_id"
      )
      .eq("client_id", client.id)
      .eq("status", "Active")
      .eq("is_deleted", false)
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

    // ── Build property ONLY for leads that have an active deal ─
    // Leads without an active deal are hidden from the dashboard entirely.
    const properties = leads
      .filter((lead) => !!dealsByLeadId[lead.id])
      .map((lead) => {
      const deal = dealsByLeadId[lead.id] ?? null;

      return {
        lead_id: lead.id,
        deal_id: deal?.id ?? null,
        address_street: deal?.property_address || lead.address_street || null,
        address_city: lead.address_city || null,
        address_province: lead.address_province || null,
        address_postal_code: lead.address_postal_code || null,
        address_unit: lead.address_unit || null,
        selling_address_street: deal?.selling_property_address || lead.selling_address_street || null,
        selling_address_city: lead.selling_address_city || null,
        selling_address_province: lead.selling_address_province || null,
        selling_address_postal_code: lead.selling_address_postal_code || null,
        selling_address_unit: lead.selling_address_unit || null,
        first_name: client.first_name || lead.first_name,
        last_name: client.last_name || lead.last_name,
        phone: client.phone || lead.phone || null,
        lead_type: lead.lead_type || deal?.type || null,
        // The single side a co-purchaser/co-seller is party to on a Purchase &
        // Sale deal. The dashboard uses this to show only that side's property,
        // tasks and milestones. NULL for a primary client (sees both sides).
        recipient_side: recipientSideForLead(lead),
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
