import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";

/**
 * POST /api/link-leads
 *
 * Called after a user sets their password (or logs in for the first time).
 * Finds all leads submitted with their email that don't yet have a deal,
 * and creates a deal for each — so every past intake appears in the dashboard.
 */
export async function POST() {
  try {
    const client = await getAuthClient();
    if (!client) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    // Find all leads submitted with this client's email
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id, lead_type, address_street, price, parent_lead_id")
      .eq("email", client.email.toLowerCase().trim());

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, linked: 0 });
    }

    // Find which of those leads already have a deal
    const leadIds = leads.map((l) => l.id);
    const { data: existingDeals } = await supabaseAdmin
      .from("deals")
      .select("lead_id")
      .in("lead_id", leadIds);

    const linkedLeadIds = new Set((existingDeals ?? []).map((d) => d.lead_id));
    const orphanedLeads = leads.filter((l) => !linkedLeadIds.has(l.id));

    if (orphanedLeads.length === 0) {
      return NextResponse.json({ success: true, linked: 0 });
    }

    // Co-person leads (parent_lead_id set) must SHARE the primary's file number
    // — all parties to one file carry one number. Resolve the primary deals'
    // numbers so we can reuse them instead of minting a standalone placeholder.
    const parentLeadIds = Array.from(
      new Set(
        orphanedLeads
          .map((l) => l.parent_lead_id)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const primaryFileByParentLead = new Map<string, string>();
    if (parentLeadIds.length > 0) {
      const { data: primaryDeals } = await supabaseAdmin
        .from("deals")
        .select("lead_id, file_number")
        .in("lead_id", parentLeadIds);
      for (const d of primaryDeals ?? []) {
        if (d.file_number) primaryFileByParentLead.set(d.lead_id, d.file_number);
      }
    }

    // Create a deal for each orphaned lead
    const year = new Date().getFullYear().toString().slice(-2);
    const dealsToInsert = orphanedLeads
      .map((lead) => {
        const typePrefix = lead.lead_type === "Purchase" ? "P"
          : lead.lead_type === "Sale" ? "S"
          : lead.lead_type === "Purchase & Sale" ? "PS"
          : lead.lead_type === "Refinance" ? "R"
          : lead.lead_type === "Condo" ? "C"
          : "L";

        const base = {
          lead_id: lead.id,
          client_id: client.id,
          type: lead.lead_type,
          status: "Pending",
          property_address: lead.address_street || null,
          price: lead.price ? parseFloat(String(lead.price).replace(/[^0-9.]/g, "")) : null,
        };

        // Co-person: inherit the primary's number. If the primary deal doesn't
        // exist yet, skip — admin conversion will create this co-client's deal
        // with the shared number (never a non-shared placeholder).
        if (lead.parent_lead_id) {
          const sharedNumber = primaryFileByParentLead.get(lead.parent_lead_id);
          if (!sharedNumber) return null;
          return { ...base, file_number: sharedNumber, is_primary_file: false };
        }

        const shortId = lead.id.replace(/-/g, "").slice(0, 6).toUpperCase();
        return {
          ...base,
          file_number: `${year}${typePrefix}-${shortId}`,
          is_primary_file: true,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    if (dealsToInsert.length === 0) {
      return NextResponse.json({ success: true, linked: 0 });
    }

    await supabaseAdmin.from("deals").insert(dealsToInsert);

    return NextResponse.json({ success: true, linked: dealsToInsert.length });
  } catch (err) {
    console.error("POST /api/link-leads error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
