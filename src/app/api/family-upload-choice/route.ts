import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";

export const dynamic = "force-dynamic";

/**
 * GET /api/family-upload-choice?lead_id=<leadId>
 *
 * Returns the resolved upload choice for the family that contains the given
 * lead. The response includes `upload_mode` and the resolved `uploader_lead_id`.
 */
export async function GET(req: Request) {
  try {
    const client = await getAuthClient();
    if (!client) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead_id");
    if (!leadId) {
      return NextResponse.json({ success: false, error: "lead_id is required" }, { status: 400 });
    }

    // Resolve the primary lead id for this family.
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, parent_lead_id")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });

    const primaryId = lead.parent_lead_id ?? lead.id;

    // Ownership guard: ensure the caller owns a converted deal for this primary.
    const { data: deal } = await supabaseAdmin
      .from("deals")
      .select("id")
      .eq("lead_id", primaryId)
      .eq("client_id", client.id)
      .eq("is_deleted", false)
      .limit(1)
      .maybeSingle();

    if (!deal) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { data: primary } = await supabaseAdmin
      .from("leads")
      .select("id, upload_mode, upload_consent_uploader_lead_id")
      .eq("id", primaryId)
      .maybeSingle();

    const upload_mode = primary?.upload_mode ?? null;
    const uploader_lead_id =
      upload_mode === "both"
        ? null
        : upload_mode === "co"
        ? primary?.upload_consent_uploader_lead_id ?? null
        : primaryId;

    return NextResponse.json({ success: true, primary_lead_id: primaryId, upload_mode, uploader_lead_id });
  } catch (err) {
    console.error("GET /api/family-upload-choice error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
