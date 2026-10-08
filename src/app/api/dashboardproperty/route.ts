import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";
import { resolveFirmKey, type FirmKey } from "@/lib/firms";
import { resolveSigningCalendarNames } from "@/lib/signingCalendar";

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
        "id, first_name, last_name, email, phone, lead_type, address_street, address_city, address_province, address_postal_code, address_unit, selling_address_street, selling_address_unit, selling_address_city, selling_address_postal_code, selling_address_province, parent_lead_id, co_person_role, firm_key, selling_deposit_amount, aps_uploaded, aps_uploaded_purchase, aps_uploaded_sale"
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
        "id, file_number, type, status, closing_date, selling_closing_date, property_address, price, selling_price, selling_property_address, deposit_amount, lead_id"
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

    // ── Upcoming signing appointment per deal ─────────────────────
    // Linked by deal_id (set when booked from a logged-in session), or by the
    // deal's file number for bookings made logged-out / before linking existed
    // (co-clients share the primary's file number, so they see it too). Only
    // confirmed, not-yet-ended appointments; the earliest one wins.
    type SigningAppt = {
      deal_id: string | null;
      file_number: string | null;
      start_at: string;
      end_at: string;
      appointment_type: "virtual" | "in_person";
      google_meet_link: string | null;
    };
    const apptSelect =
      "deal_id, file_number, start_at, end_at, appointment_type, google_meet_link";
    const nowIso = new Date().toISOString();
    // Name of the calendar each file books its signing with, so the dashboard
    // task button is labelled on first load (no extra request when it opens).
    const signingCalendarNames = await resolveSigningCalendarNames((deals ?? []).map((d) => d.id));
    const dealIds = (deals ?? []).map((d) => d.id);
    const fileNumbers = [
      ...new Set((deals ?? []).map((d) => d.file_number).filter((f): f is string => !!f)),
    ];
    const apptRows: SigningAppt[] = [];
    if (dealIds.length > 0) {
      const { data } = await supabaseAdmin
        .from("signing_appointments")
        .select(apptSelect)
        .in("deal_id", dealIds)
        .eq("status", "confirmed")
        .gt("end_at", nowIso);
      apptRows.push(...((data ?? []) as unknown as SigningAppt[]));
    }
    if (fileNumbers.length > 0) {
      const { data } = await supabaseAdmin
        .from("signing_appointments")
        .select(apptSelect)
        .in("file_number", fileNumbers)
        .eq("status", "confirmed")
        .gt("end_at", nowIso);
      apptRows.push(...((data ?? []) as unknown as SigningAppt[]));
    }
    let officeAddress: string | null = null;
    if (apptRows.some((a) => a.appointment_type === "in_person")) {
      const { data: st } = await supabaseAdmin
        .from("signing_settings")
        .select("office_address")
        .limit(1)
        .maybeSingle();
      officeAddress = st?.office_address ?? null;
    }
    const signingForDeal = (deal: { id: string; file_number: string | null } | null) => {
      if (!deal) return null;
      const match = apptRows
        .filter(
          (a) =>
            a.deal_id === deal.id ||
            (!!deal.file_number && a.file_number === deal.file_number),
        )
        .sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
      if (!match) return null;
      return {
        start_at: match.start_at,
        end_at: match.end_at,
        appointment_type: match.appointment_type,
        meet_link: match.google_meet_link,
        location: match.appointment_type === "in_person" ? officeAddress : null,
      };
    };

    // ── Parties per transaction (primary + co-persons) ───────────
    // For the hero "Parties" panel. A transaction "family" is the primary lead
    // plus every lead whose parent_lead_id points at it. Co-persons may belong to
    // a DIFFERENT client (their own account), so we resolve the family with the
    // service-role client by primary id rather than from this client's leads.
    const visibleLeads = leads.filter((lead) => !!dealsByLeadId[lead.id]);
    const primaryIdByLeadId: Record<string, string> = {};
    for (const lead of visibleLeads) {
      primaryIdByLeadId[lead.id] = lead.parent_lead_id ?? lead.id;
    }
    const primaryIds = [...new Set(Object.values(primaryIdByLeadId))];

    let familyLeads: Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      parent_lead_id: string | null;
      co_person_role: string | null;
      firm_key: string | null;
    }> = [];
    if (primaryIds.length > 0) {
      const inList = primaryIds.join(",");
      const { data: fam } = await supabaseAdmin
        .from("leads")
        .select("id, first_name, last_name, parent_lead_id, co_person_role, firm_key, created_at")
        .or(`id.in.(${inList}),parent_lead_id.in.(${inList})`)
        .order("created_at", { ascending: true });
      familyLeads = fam ?? [];
    }

    // Which firm retains this transaction — the same rule as lib/leadFirm.ts:
    // the ROOT lead of the family is authoritative, because co-clients on one
    // file are retained by ONE firm and signed ONE retainer wording. The root
    // is already in `familyLeads` (it was fetched by primary id), so this costs
    // no extra query. A child whose parent row has gone falls back to its own
    // copy, which the admin app keeps in step; anything unreadable resolves to
    // DEFAULT_FIRM_KEY, exactly as the server-side helper does.
    const firmForPrimary = (primaryId: string, ownFirmKey: string | null): FirmKey => {
      const root = familyLeads.find((l) => l.id === primaryId);
      return resolveFirmKey(root?.firm_key ?? ownFirmKey);
    };

    // Primary first, then co-persons in creation order. `role` is "primary" for
    // the primary applicant and the co-person's own role ("purchaser"/"seller")
    // otherwise — the frontend uses it to filter by side on Purchase & Sale deals.
    const partiesForPrimary = (primaryId: string) => {
      const members = familyLeads.filter(
        (l) => l.id === primaryId || l.parent_lead_id === primaryId
      );
      const primary = members.find((m) => m.id === primaryId);
      const coPersons = members.filter((m) => m.id !== primaryId);
      return [...(primary ? [primary] : []), ...coPersons].map((m) => ({
        lead_id: m.id,
        first_name: m.first_name ?? "",
        last_name: m.last_name ?? "",
        role: m.id === primaryId ? "primary" : (m.co_person_role ?? "applicant"),
      }));
    };

    // ── Build property ONLY for leads that have an active deal ─
    // Leads without an active deal are hidden from the dashboard entirely.
    const properties = visibleLeads
      .map((lead) => {
      const deal = dealsByLeadId[lead.id] ?? null;

      return {
        lead_id: lead.id,
        deal_id: deal?.id ?? null,
        signing_appointment: signingForDeal(deal),
        signing_calendar_name: deal ? (signingCalendarNames[deal.id] ?? null) : null,
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
        selling_deposit_amount: lead.selling_deposit_amount ?? null,
        aps_uploaded: !!lead.aps_uploaded,
        aps_uploaded_purchase: !!lead.aps_uploaded_purchase,
        aps_uploaded_sale: !!lead.aps_uploaded_sale,
        first_name: client.first_name || lead.first_name,
        last_name: client.last_name || lead.last_name,
        phone: client.phone || lead.phone || null,
        email: client.email || lead.email || null,
        lead_type: lead.lead_type || deal?.type || null,
        // The single side a co-purchaser/co-seller is party to on a Purchase &
        // Sale deal. The dashboard uses this to show only that side's property,
        // tasks and milestones. NULL for a primary client (sees both sides).
        recipient_side: recipientSideForLead(lead),
        // Which firm this file is retained by. The portal is shared by both
        // firms, so the client-facing contact details ("Need Assistance?") are
        // chosen from this rather than hard-coded to Nava Wilson.
        firm_key: firmForPrimary(primaryIdByLeadId[lead.id], lead.firm_key ?? null),
        // Everyone on this transaction (primary + co-persons) for the hero panel.
        parties: partiesForPrimary(primaryIdByLeadId[lead.id]),
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
