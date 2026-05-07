import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";

type Side = "purchase" | "sale" | null;

interface Slot {
  leadId: string;
  side: Side;
}

const PURCHASE_AND_SALE = "Purchase & Sale";

/**
 * GET /api/retainer/check
 *
 * Checks if the authenticated user has signed every required retainer.
 * For "Purchase & Sale" leads we expand the lead into TWO slots — one for
 * the purchase property and one for the sale property — and require a
 * signature for each.
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

    const { data: deals } = await supabaseAdmin
      .from("deals")
      .select("lead_id")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    const leadIds = (deals || []).map((d) => d.lead_id).filter(Boolean);

    if (leadIds.length === 0) {
      return NextResponse.json({ signed: false });
    }

    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select(
        "id, first_name, last_name, lead_type, address_street, address_city, address_province, address_postal_code, selling_address_street, selling_address_city, selling_address_province, selling_address_postal_code"
      )
      .in("id", leadIds);

    const leadById = new Map((leads || []).map((l) => [l.id, l]));

    // Build slots in the same order as leadIds (which is newest-first).
    const slots: Slot[] = [];
    for (const id of leadIds) {
      const lead = leadById.get(id);
      if (lead?.lead_type === PURCHASE_AND_SALE) {
        slots.push({ leadId: id, side: "purchase" });
        slots.push({ leadId: id, side: "sale" });
      } else {
        slots.push({ leadId: id, side: null });
      }
    }

    const { data: signatures } = await supabaseAdmin
      .from("retainer_signatures")
      .select("lead_id, side")
      .in("lead_id", leadIds);

    const signedKey = (leadId: string, side: Side) => `${leadId}::${side ?? ""}`;
    const signedSet = new Set(
      (signatures || []).map((s) => signedKey(s.lead_id, (s.side ?? null) as Side))
    );

    const signedCount = slots.filter((s) =>
      signedSet.has(signedKey(s.leadId, s.side))
    ).length;
    const totalRetainers = slots.length;

    const nextSlot = slots.find(
      (s) => !signedSet.has(signedKey(s.leadId, s.side))
    );

    if (!nextSlot) {
      return NextResponse.json({ signed: true });
    }

    const lead = leadById.get(nextSlot.leadId);

    const fullName = lead
      ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim()
      : "";

    const addressParts =
      nextSlot.side === "sale"
        ? [
            lead?.selling_address_street,
            lead?.selling_address_city,
            lead?.selling_address_province,
            lead?.selling_address_postal_code,
          ]
        : [
            lead?.address_street,
            lead?.address_city,
            lead?.address_province,
            lead?.address_postal_code,
          ];

    const propertyAddress = addressParts.filter(Boolean).join(", ");

    return NextResponse.json({
      signed: false,
      full_name: fullName,
      signed_date: new Date().toISOString().split("T")[0],
      property_address: propertyAddress,
      lead_type: lead?.lead_type ?? "",
      side: nextSlot.side,
      retainer_current: signedCount + 1,
      retainer_total: totalRetainers,
    });
  } catch (err) {
    console.error("[Retainer Check] Server error:", err);
    return NextResponse.json(
      { signed: false, error: "Server error" },
      { status: 500 }
    );
  }
}
