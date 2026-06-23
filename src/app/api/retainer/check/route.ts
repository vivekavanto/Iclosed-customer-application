import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";
import { resolveRetainerLeadId } from "@/lib/retainerToken";
import { formatLeadTypeLabelForRecipient } from "@/lib/leadEmailAddress";
import { leadHasAccount } from "@/lib/leadHasAccount";

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
export async function GET(req: Request) {
  try {
    // Two ways to identify the signer:
    //   • ?token=  → account-free retainer link (the token maps to one lead).
    //   • else     → the logged-in client signs from inside the dashboard.
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    let leadIds: string[] = [];

    if (token) {
      const leadId = await resolveRetainerLeadId(token);
      if (!leadId) {
        return NextResponse.json(
          { signed: false, error: "This retainer link is invalid or has expired." },
          { status: 401 }
        );
      }
      leadIds = [leadId];
    } else {
      const client = await getAuthClient();
      if (!client) {
        return NextResponse.json(
          { signed: false, error: "Not authenticated" },
          { status: 401 }
        );
      }

      const { data: deals } = await supabaseAdmin
        .from("deals")
        .select("lead_id, status")
        .eq("client_id", client.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      // A deal only requires a retainer once the firm has CONVERTED it.
      // Intake auto-linked deals (see /api/link-leads) sit at status "Pending"
      // and must NOT trigger the retainer; admin conversion (see convertLead.ts)
      // creates the deal as "Active" and marks its lead "Converted". So every
      // status except "Pending" counts as converted. This is per-deal: a client
      // with one converted and one pending deal only signs for the converted one.
      const NON_CONVERTED_DEAL_STATUSES = new Set(["Pending"]);
      leadIds = (deals || [])
        .filter((d) => !NON_CONVERTED_DEAL_STATUSES.has(d.status))
        .map((d) => d.lead_id)
        .filter(Boolean);

      // No converted deal yet → no retainer required. Return signed:true so the
      // dashboard guard doesn't bounce the user onto an empty retainer page
      // (it only redirects when signed === false).
      if (leadIds.length === 0) {
        return NextResponse.json({ signed: true });
      }
    }

    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select(
        "id, first_name, last_name, lead_type, address_street, address_city, address_province, address_postal_code, selling_address_street, selling_address_city, selling_address_province, selling_address_postal_code, parent_lead_id, co_person_role, submit_on_behalf, client_id, email"
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
      // Everything required is signed. But a PRIMARY who has co-person(s) and
      // hasn't yet answered the "Want to help with their paperwork?" popup
      // (submit_on_behalf IS NULL) must still answer it — otherwise reloading
      // or returning after signing would skip the decision entirely. Re-surface
      // the popup so the value can't be bypassed.
      const primaryLead = (leads || []).find((l) => !l.parent_lead_id);
      if (primaryLead && primaryLead.submit_on_behalf == null) {
        const { count: coCount } = await supabaseAdmin
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("parent_lead_id", primaryLead.id);
        if ((coCount ?? 0) > 0) {
          return NextResponse.json({
            signed: true,
            co_person_prompt_pending: true,
            lead_type: formatLeadTypeLabelForRecipient(primaryLead),
            side: null,
            account_exists: await leadHasAccount(primaryLead),
          });
        }
      }
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
    const isCoPerson = Boolean(lead?.parent_lead_id);
    const coRole = (lead?.co_person_role as "purchaser" | "seller" | null) ?? null;

    // A P&S deal is treated as two independent transactions for its co-persons:
    // a co-purchaser retains us only for the PURCHASE side and must see only the
    // purchase property, a co-seller only the SALE side. The primary client (and
    // any co-person without an explicit role) retains both sides and sees both.
    const coPurchaserOnly = isPS && isCoPerson && coRole === "purchaser";
    const coSellerOnly = isPS && isCoPerson && coRole === "seller";
    const showCombined = isPS && !coPurchaserOnly && !coSellerOnly;

    // Surface a side label for single-side viewers (co-purchaser/co-seller) so
    // the page renders e.g. "Purchase Property" above the one relevant address.
    const displaySide: Side = coPurchaserOnly
      ? "purchase"
      : coSellerOnly
        ? "sale"
        : nextSlot.side;

    // For backward compatibility with single-side leads, keep `property_address`
    // populated with the relevant address. Only combined P&S viewers receive
    // structured purchase_address + sale_address so the UI renders both.
    const propertyAddress = showCombined
      ? [purchaseAddress, saleAddress].filter(Boolean).join(" / ")
      : coSellerOnly
        ? saleAddress
        : purchaseAddress;

    const displayLeadType = formatLeadTypeLabelForRecipient(lead);

    return NextResponse.json({
      signed: false,
      full_name: fullName,
      signed_date: new Date().toISOString().split("T")[0],
      property_address: propertyAddress,
      purchase_address: showCombined ? purchaseAddress : null,
      sale_address: showCombined ? saleAddress : null,
      lead_type: displayLeadType,
      side: displaySide,
      retainer_current: signedCount + 1,
      retainer_total: totalRetainers,
      is_co_person: isCoPerson,
      co_person_role: coRole,
    });
  } catch (err) {
    console.error("[Retainer Check] Server error:", err);
    return NextResponse.json(
      { signed: false, error: "Server error" },
      { status: 500 }
    );
  }
}
