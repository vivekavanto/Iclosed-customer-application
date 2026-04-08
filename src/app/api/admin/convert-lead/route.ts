import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { convertSingleLead, syncSharedTasksAcrossDeals } from "@/lib/convertLead";

/**
 * POST /api/admin/convert-lead
 *
 * Called by the admin panel when an admin converts a lead to a deal.
 * This endpoint:
 *   1. Creates / finds a client record
 *   2. Creates a deal linked to the client + lead
 *   3. Copies milestones from stage_templates
 *   4. Copies tasks from task_templates
 *   5. Creates a Supabase Auth user (invite email sent automatically)
 *   6. Links auth_user_id to the client record
 *   7. Auto-converts any co-purchaser leads (parent_lead_id = this lead)
 *   8. Syncs shared tasks across all linked deals
 *
 * Expects body:
 * {
 *   lead_id: string,
 *   file_number?: string,   // e.g. "26P-0059"  (optional, auto-generated if missing)
 *   closing_date?: string,  // ISO string e.g. "2026-05-15"
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { lead_id, file_number, closing_date } = body;

    if (!lead_id) {
      return NextResponse.json({ success: false, error: "lead_id is required" }, { status: 400 });
    }

    // ── 1. Fetch and validate the lead ────────────────────────────────────────
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    if (lead.status === "Converted") {
      return NextResponse.json({ success: false, error: "Lead is already converted" }, { status: 409 });
    }

    const { data: existingDeal } = await supabaseAdmin
      .from("deals")
      .select("id, file_number")
      .eq("lead_id", lead_id)
      .maybeSingle();

    if (existingDeal) {
      return NextResponse.json({ success: false, error: `Lead already has deal ${existingDeal.file_number}` }, { status: 409 });
    }

    // ── 2. Convert the primary lead ───────────────────────────────────────────
    const result = await convertSingleLead({
      lead,
      closingDate: closing_date,
      fileNumber: file_number,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    // ── 3. Auto-convert co-purchaser leads ────────────────────────────────────
    const coResults: Array<{ lead_id: string; deal_id: string; file_number: string; invite_sent: boolean; error?: string }> = [];

    try {
      const { data: coLeads } = await supabaseAdmin
        .from("leads")
        .select("*")
        .eq("parent_lead_id", lead_id)
        .neq("status", "Converted");

      if (coLeads && coLeads.length > 0) {
        for (const coLead of coLeads) {
          try {
            const coResult = await convertSingleLead({
              lead: coLead,
              parentClientId: result.client_id,
              closingDate: closing_date,
            });

            coResults.push({
              lead_id: coLead.id,
              deal_id: coResult.deal_id,
              file_number: coResult.file_number,
              invite_sent: coResult.invite_sent,
              error: coResult.error,
            });
          } catch (coErr: any) {
            console.error(`[convert-lead] Co-purchaser conversion failed for lead ${coLead.id}:`, coErr);
            coResults.push({ lead_id: coLead.id, deal_id: "", file_number: "", invite_sent: false, error: coErr.message });
          }
        }
      }
    } catch (coQueryErr) {
      console.warn("[convert-lead] Co-purchaser query failed (non-blocking):", coQueryErr);
    }

    // ── 4. Sync shared tasks across ALL linked deals ──────────────────────────
    try {
      await syncSharedTasksAcrossDeals(result.deal_id);
    } catch (syncErr) {
      console.warn("[convert-lead] Shared task sync failed (non-blocking):", syncErr);
    }

    return NextResponse.json({
      success: true,
      deal_id: result.deal_id,
      file_number: result.file_number,
      client_id: result.client_id,
      invite_sent: result.invite_sent,
      auth_error: result.auth_error,
      co_purchasers_converted: coResults,
      message: result.invite_sent
        ? `Deal created and invite email sent to ${lead.email}`
        : `Deal created, but invite could not be sent: ${result.auth_error || "Create login manually"}`,
    });
  } catch (err) {
    console.error("POST /api/admin/convert-lead error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
