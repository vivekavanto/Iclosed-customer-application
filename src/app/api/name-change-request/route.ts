import { NextResponse } from "next/server";
import { getAuthClient } from "@/lib/getAuthClient";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { sendNameChangeRequestEmail } from "@/lib/sendNameChangeRequestEmail";

/**
 * POST /api/name-change-request
 *
 * Sends a name change request email to the law clerk inbox.
 *
 * Body: {
 *   lead_id: string,
 *   current_first_name?: string,
 *   current_last_name?: string,
 *   requested_first_name: string,
 *   requested_last_name: string,
 *   message?: string,
 * }
 */
export async function POST(req: Request) {
  const client = await getAuthClient();
  if (!client) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    lead_id?: unknown;
    current_first_name?: unknown;
    current_last_name?: unknown;
    requested_first_name?: unknown;
    requested_last_name?: unknown;
    message?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
  const currentFirstName =
    typeof body.current_first_name === "string" ? body.current_first_name.trim() : "";
  const currentLastName =
    typeof body.current_last_name === "string" ? body.current_last_name.trim() : "";
  const requestedFirstName =
    typeof body.requested_first_name === "string" ? body.requested_first_name.trim() : "";
  const requestedLastName =
    typeof body.requested_last_name === "string" ? body.requested_last_name.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!leadId) {
    return NextResponse.json({ success: false, error: "lead_id is required" }, { status: 400 });
  }

  if (!requestedFirstName && !requestedLastName) {
    return NextResponse.json(
      { success: false, error: "Requested name cannot be empty" },
      { status: 400 },
    );
  }

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, client_id")
    .eq("id", leadId)
    .maybeSingle();

  if (!lead || lead.client_id !== client.id) {
    return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
  }

  const sent = await sendNameChangeRequestEmail({
    leadId,
    currentFirstName,
    currentLastName,
    requestedFirstName,
    requestedLastName,
    message: message || undefined,
  });

  if (!sent) {
    return NextResponse.json(
      { success: false, error: "Failed to send name change request" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
