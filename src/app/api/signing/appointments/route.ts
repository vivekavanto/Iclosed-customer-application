import { NextResponse } from "next/server";
import { adminAppUrl } from "@/lib/adminAppUrl";
import { getAuthClient } from "@/lib/getAuthClient";
import supabaseAdmin from "@/lib/supabaseAdmin";
import {
  dealSide,
  findExistingAppointment,
  parseSide,
  resolveSigningCalendar,
  type PortalDeal,
  type SigningSide,
} from "@/lib/signingCalendar";

// POST /api/signing/appointments
//
// Proxies to the admin app's own public route (src/app/api/signing/appointments
// /route.ts in the admin repo), which re-validates the slot, creates the Google
// Calendar event and inserts the signing_appointments row. See the availability
// proxy in this same directory tree for why this is a server-to-server
// passthrough rather than a duplicated implementation.
//
// Two kinds of caller:
//  - Public direct link (/signing/[initials], no dealId): forwarded as-is. If
//    the caller happens to be signed in, the row is still linked to their deal
//    afterwards (best effort) so the dashboard can show it.
//  - Logged-in client booking from their task (dealId supplied): the deal must
//    belong to them, the calendar is forced to the file's admin-set "Signing
//    with" regardless of what the browser sent, and a property that already has
//    an appointment is refused.

async function loadClientDeal(dealId: string): Promise<PortalDeal | null> {
  const client = await getAuthClient();
  if (!client) return null;
  const { data } = await supabaseAdmin
    .from("deals")
    .select("id, lead_id, file_number, type, signing_with")
    .eq("id", dealId)
    .eq("client_id", client.id)
    .eq("status", "Active")
    .eq("is_deleted", false)
    .maybeSingle();
  return (data as PortalDeal | null) ?? null;
}

async function linkAppointment(
  appointmentId: string,
  deal: Pick<PortalDeal, "id" | "lead_id">,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("signing_appointments")
    .update({ deal_id: deal.id, lead_id: deal.lead_id })
    .eq("id", appointmentId);
  if (error) console.error("[signing appointments] deal link failed:", error.message);
}

// Public-link bookings carry no dealId: if the caller is signed in, match their
// own active deals by the typed file number (never an id from the browser).
async function dealFromFileNumber(fileNumber: string | null): Promise<PortalDeal | null> {
  const client = await getAuthClient();
  if (!client) return null;
  const { data: deals } = await supabaseAdmin
    .from("deals")
    .select("id, lead_id, file_number, type, signing_with")
    .eq("client_id", client.id)
    .eq("status", "Active")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  const list = (deals ?? []) as PortalDeal[];
  const wanted = fileNumber?.trim().toLowerCase();
  return (
    (wanted && list.find((d) => d.file_number?.trim().toLowerCase() === wanted)) ||
    (list.length === 1 ? list[0] : null)
  );
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let deal: PortalDeal | null = null;
  let side: SigningSide | null = null;
  const forward: Record<string, unknown> = { ...body };

  if (typeof body.dealId === "string" && body.dealId) {
    deal = await loadClientDeal(body.dealId);
    if (!deal) {
      return NextResponse.json(
        { success: false, error: "We could not find your file. Please sign in again." },
        { status: 403 },
      );
    }
    side = parseSide(body.side) ?? dealSide(deal.type);

    if (await findExistingAppointment(deal, side)) {
      return NextResponse.json(
        { success: false, error: "A signing appointment is already booked for this property." },
        { status: 409 },
      );
    }

    const initials = await resolveSigningCalendar(deal.signing_with);
    if (!initials) {
      return NextResponse.json(
        { success: false, error: "Signing appointments are not available right now." },
        { status: 503 },
      );
    }
    forward.lawyerInitials = initials;
    forward.side = side;
  }
  delete forward.dealId;

  const target = new URL("/api/signing/appointments", adminAppUrl());

  try {
    const res = await fetch(target.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forward),
      cache: "no-store",
    });
    const json = await res.json();

    if (res.ok && json?.success && json.data?.id) {
      try {
        const linkTo =
          deal ??
          (await dealFromFileNumber(typeof body.fileNumber === "string" ? body.fileNumber : null));
        if (linkTo) await linkAppointment(String(json.data.id), linkTo);
      } catch (err) {
        console.error("[signing appointments] deal link error:", err);
      }
    }

    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not reach the booking service. Please try again." },
      { status: 502 },
    );
  }
}
