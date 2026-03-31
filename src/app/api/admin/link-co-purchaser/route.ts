import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

/**
 * POST /api/admin/link-co-purchaser
 *
 * Called by the admin panel when approving a co-purchaser flag.
 * Sets parent_lead_id on the co-purchaser lead and approves the flag.
 * The admin then converts the lead separately via /api/admin/convert-lead.
 *
 * Body: { lead_id: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { lead_id } = body;

    if (!lead_id) {
      return NextResponse.json({ success: false, error: "lead_id is required" }, { status: 400 });
    }

    // Fetch the lead
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("id, address_match_flag, parent_lead_id")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    const flag = lead.address_match_flag as { matched_lead_id?: string; status?: string } | null;

    if (!flag || !flag.matched_lead_id) {
      return NextResponse.json({ success: false, error: "No address match flag on this lead" }, { status: 400 });
    }

    if (flag.status !== "pending") {
      return NextResponse.json({ success: false, error: `Flag already ${flag.status}` }, { status: 409 });
    }

    // Verify the matched lead exists
    const { data: matchedLead } = await supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name")
      .eq("id", flag.matched_lead_id)
      .single();

    if (!matchedLead) {
      return NextResponse.json({ success: false, error: "Matched lead not found" }, { status: 404 });
    }

    // Set parent_lead_id and approve the flag
    const { error: updateError } = await supabaseAdmin
      .from("leads")
      .update({
        parent_lead_id: flag.matched_lead_id,
        address_match_flag: { ...flag, status: "approved" },
      })
      .eq("id", lead_id);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Co-purchaser linked to primary lead (${matchedLead.first_name} ${matchedLead.last_name}). Convert this lead separately to create their deal and send invite.`,
      parent_lead_id: flag.matched_lead_id,
    });
  } catch (err) {
    console.error("POST /api/admin/link-co-purchaser error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/link-co-purchaser/dismiss
 * Dismisses a co-purchaser flag (false positive).
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { lead_id } = body;

    if (!lead_id) {
      return NextResponse.json({ success: false, error: "lead_id is required" }, { status: 400 });
    }

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("address_match_flag")
      .eq("id", lead_id)
      .single();

    if (!lead?.address_match_flag) {
      return NextResponse.json({ success: false, error: "No flag to dismiss" }, { status: 400 });
    }

    await supabaseAdmin
      .from("leads")
      .update({
        address_match_flag: { ...lead.address_match_flag, status: "dismissed" },
      })
      .eq("id", lead_id);

    return NextResponse.json({ success: true, message: "Flag dismissed" });
  } catch (err) {
    console.error("PATCH /api/admin/link-co-purchaser error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
