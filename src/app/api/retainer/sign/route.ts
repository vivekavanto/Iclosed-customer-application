import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";

/**
 * POST /api/retainer/sign
 *
 * Saves a retainer signature for the authenticated user's lead.
 * Body: { full_name: string, signature: string, signed_date: string }
 */
export async function POST(req: Request) {
  try {
    const client = await getAuthClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { full_name, signature, signed_date } = body;

    if (!full_name || !signature || !signed_date) {
      return NextResponse.json(
        { success: false, error: "full_name, signature, and signed_date are required" },
        { status: 400 }
      );
    }

    // Find the user's lead(s) via deals
    const { data: deals } = await supabaseAdmin
      .from("deals")
      .select("lead_id")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    const leadIds = (deals || []).map((d) => d.lead_id).filter(Boolean);

    if (leadIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "No leads found for this account" },
        { status: 404 }
      );
    }

    // Use the most recent lead
    const leadId = leadIds[0];

    // Fetch the lead to validate name match
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("first_name, last_name")
      .eq("id", leadId)
      .single();

    if (lead) {
      const intakeName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim().toLowerCase();
      const signatureValue = signature.trim().toLowerCase();

      if (intakeName && signatureValue !== intakeName) {
        return NextResponse.json(
          { success: false, error: "Signature must match the name you provided in the intake form" },
          { status: 400 }
        );
      }
    }

    // Check if already signed for this lead
    const { data: existing } = await supabaseAdmin
      .from("retainer_signatures")
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        message: "Retainer already signed",
        already_signed: true,
      });
    }

    // Insert the signature
    const { error } = await supabaseAdmin
      .from("retainer_signatures")
      .insert({
        lead_id: leadId,
        full_name,
        signature,
        signed_date,
      });

    if (error) {
      console.error("[Retainer Sign] Insert error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Retainer Sign] Server error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
