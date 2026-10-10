import { NextResponse } from "next/server";
import { adminAppUrl } from "@/lib/adminAppUrl";
import { getAuthClient } from "@/lib/getAuthClient";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { advanceMilestone } from "@/lib/syncSharedTask";
import { notifyClientTaskCompleted } from "@/lib/notifyTaskCompleted";
import { isSigningAppointmentTask } from "@/lib/signingAppointment";
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

// A confirmed booking completes the "Book your signing appointment" task, the
// same way submitting any other task does (mark Completed, advance the
// milestone, tell the office). Skipped when the task is already done.
async function completeSigningTask(
  deal: Pick<PortalDeal, "id">,
  side: SigningSide | null,
): Promise<void> {
  const { data: tasks } = await supabaseAdmin
    .from("tasks")
    .select("id, title, milestone_id, side")
    .eq("deal_id", deal.id)
    .eq("completed", false)
    .ilike("title", "%book your signing appointment%");
  const task = (tasks ?? []).find(
    (t) => isSigningAppointmentTask(t.title) && (!side || !t.side || t.side === side),
  );
  if (!task) return;

  await supabaseAdmin
    .from("tasks")
    .update({ completed: true, status: "Completed", completed_at: new Date().toISOString() })
    .eq("id", task.id);
  if (task.milestone_id) await advanceMilestone(deal.id, task.milestone_id);
  await notifyClientTaskCompleted({
    taskId: task.id,
    dealId: deal.id,
    taskTitle: task.title,
    source: "signing-appointments",
  });
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

    // The closing-date cutoff is enforced from the file's own date, never the
    // one the browser typed, so it can't be blanked or edited to get around it.
    const { data: dates } = await supabaseAdmin
      .from("deals")
      .select("closing_date, selling_closing_date")
      .eq("id", deal.id)
      .maybeSingle();
    const fileClosing = side === "sale" ? dates?.selling_closing_date : dates?.closing_date;
    if (fileClosing) forward.closingDate = fileClosing;
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
        if (linkTo) {
          await linkAppointment(String(json.data.id), linkTo);
          await completeSigningTask(linkTo, side ?? parseSide(body.side) ?? dealSide(linkTo.type));
        }
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
