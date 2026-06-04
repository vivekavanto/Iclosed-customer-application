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
 *
 * "Purchase & Sale" leads now collect ONE combined retainer (side=null) that
 * lists BOTH the purchase and sale property addresses. Legacy P&S leads that
 * already have both side-specific signatures (purchase + sale) are still
 * considered fully signed, so users mid-flow under the old behaviour are not
 * forced to sign again.
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
      .eq("is_deleted", false)
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

    // One slot per lead — P&S retainers are now combined.
    const slots: Slot[] = leadIds.map((id) => ({ leadId: id, side: null }));

    const { data: signatures } = await supabaseAdmin
      .from("retainer_signatures")
      .select("lead_id, side")
      .in("lead_id", leadIds);

    const signedKey = (leadId: string, side: Side) => `${leadId}::${side ?? ""}`;
    const signedSet = new Set(
      (signatures || []).map((s) => signedKey(s.lead_id, (s.side ?? null) as Side))
    );

    const isLeadSigned = (leadId: string, leadType: string): boolean => {
      // New combined signature (side=null) → done
      if (signedSet.has(signedKey(leadId, null))) return true;
      // Legacy P&S: both side-specific signatures present → done
      if (leadType === PURCHASE_AND_SALE) {
        return (
          signedSet.has(signedKey(leadId, "purchase")) &&
          signedSet.has(signedKey(leadId, "sale"))
        );
      }
      return false;
    };

    const signedCount = slots.filter((s) => {
      const lead = leadById.get(s.leadId);
      return isLeadSigned(s.leadId, lead?.lead_type ?? "");
    }).length;
    const totalRetainers = slots.length;

    const nextSlot = slots.find((s) => {
      const lead = leadById.get(s.leadId);
      return !isLeadSigned(s.leadId, lead?.lead_type ?? "");
    });

    if (!nextSlot) {
      return NextResponse.json({ signed: true });
    }

    const lead = leadById.get(nextSlot.leadId);

    const fullName = lead
      ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim()
      : "";

    const purchaseAddress = [
      lead?.address_street,
      lead?.address_city,
      lead?.address_province,
      lead?.address_postal_code,
    ]
      .filter(Boolean)
      .join(", ");

    const saleAddress = [
      lead?.selling_address_street,
      lead?.selling_address_city,
      lead?.selling_address_province,
      lead?.selling_address_postal_code,
    ]
      .filter(Boolean)
      .join(", ");

    const isPS = lead?.lead_type === PURCHASE_AND_SALE;

    // For backward compatibility with single-side leads, keep `property_address`
    // populated with the relevant address. P&S leads also receive structured
    // purchase_address + sale_address so the UI can render both.
    const propertyAddress = isPS
      ? [purchaseAddress, saleAddress].filter(Boolean).join(" / ")
      : purchaseAddress;

    return NextResponse.json({
      signed: false,
      full_name: fullName,
      signed_date: new Date().toISOString().split("T")[0],
      property_address: propertyAddress,
      purchase_address: isPS ? purchaseAddress : null,
      sale_address: isPS ? saleAddress : null,
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
