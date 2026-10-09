import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";

// Server-only helpers for the client-portal signing booking: which calendar a
// file books against ("Signing with", admin-only) and whether the property
// already has an appointment. Reads the tables the admin app owns
// (signing_lawyers, signing_settings, signing_appointments) through the shared
// database. Never import from client components.

export type SigningSide = "purchase" | "sale";

export interface PortalDeal {
  id: string;
  lead_id: string | null;
  file_number: string | null;
  type: string | null;
  signing_with: string | null;
}

/** Side a single-sided deal is on; null for Purchase & Sale / unknown. */
export function dealSide(type: string | null | undefined): SigningSide | null {
  const t = (type ?? "").toLowerCase();
  const p = t.includes("purchase");
  const s = t.includes("sale");
  if (p && !s) return "purchase";
  if (s && !p) return "sale";
  return null;
}

export function parseSide(value: unknown): SigningSide | null {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "purchase" || v === "sale" ? v : null;
}

/**
 * Initials of the calendar this file books with: the file's own "Signing with"
 * if that calendar is still active, else the global default, else the first
 * active calendar. Null only when no calendar is bookable at all.
 */
export async function resolveSigningCalendar(
  dealSigningWith: string | null,
): Promise<string | null> {
  const { data: lawyers } = await supabaseAdmin
    .from("signing_lawyers")
    .select("initials")
    .eq("is_active", true)
    .order("initials");
  const active = (lawyers ?? []).map((l) => l.initials as string);
  if (active.length === 0) return null;

  const find = (wanted: string | null | undefined) =>
    wanted ? active.find((i) => i.toLowerCase() === wanted.trim().toLowerCase()) : undefined;

  const own = find(dealSigningWith);
  if (own) return own;

  const { data: settings } = await supabaseAdmin
    .from("signing_settings")
    .select("default_signing_with")
    .limit(1)
    .maybeSingle();
  return find(settings?.default_signing_with as string | null) ?? active[0];
}

export interface ExistingAppointment {
  id: string;
  start_at: string;
  end_at: string;
  appointment_type: "virtual" | "in_person";
  google_meet_link: string | null;
}

/**
 * The confirmed appointment already booked for this property, if any. A
 * property is a deal plus a side, so a Purchase & Sale file can hold one
 * booking per side. Bookings made before linking existed are matched by file
 * number.
 */
export async function findExistingAppointment(
  deal: Pick<PortalDeal, "id" | "file_number">,
  side: SigningSide | null,
): Promise<ExistingAppointment | null> {
  const cols = "id, start_at, end_at, appointment_type, google_meet_link, side, deal_id, file_number";
  const { data: byDeal } = await supabaseAdmin
    .from("signing_appointments")
    .select(cols)
    .eq("deal_id", deal.id)
    .eq("status", "confirmed");
  let rows = byDeal ?? [];
  if (deal.file_number) {
    const { data: byFile } = await supabaseAdmin
      .from("signing_appointments")
      .select(cols)
      .eq("file_number", deal.file_number)
      .eq("status", "confirmed");
    rows = [...rows, ...(byFile ?? [])];
  }
  const match = rows
    .filter((r) => !side || !r.side || r.side === side)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
  return (match as ExistingAppointment | undefined) ?? null;
}

export async function getOfficeAddress(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("signing_settings")
    .select("office_address")
    .limit(1)
    .maybeSingle();
  return (data?.office_address as string | null) ?? null;
}

export interface SigningBookingState {
  dealId: string;
  /** Calendar to book against. Initials only: the client never sees who it is. */
  initials: string;
  booked: {
    startAt: string;
    endAt: string;
    appointmentType: "virtual" | "in_person";
    meetLink: string | null;
    location: string | null;
  } | null;
}

export type SigningBookingStateResult =
  | { ok: true; data: SigningBookingState }
  | { ok: false; status: number; error: string };

/**
 * Everything the client's signing task needs to render: the calendar for the
 * file ("Signing with") and any appointment already booked for the property.
 * Shared by GET /api/signing/for-deal and the server-rendered /signing page, so
 * an already-booked property shows its appointment on first paint.
 */
export async function getSigningBookingState(
  dealParam: string | null,
  sideParam: unknown,
): Promise<SigningBookingStateResult> {
  const client = await getAuthClient();
  if (!client) return { ok: false, status: 401, error: "Not authenticated" };

  const { data: deals } = await supabaseAdmin
    .from("deals")
    .select("id, lead_id, file_number, type, signing_with")
    .eq("client_id", client.id)
    .eq("status", "Active")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  const list = (deals ?? []) as PortalDeal[];
  const deal = list.find((d) => d.id === dealParam) ?? list[0];
  if (!deal) return { ok: false, status: 404, error: "No active file found" };

  const side = parseSide(sideParam) ?? dealSide(deal.type);
  const [initials, existing] = await Promise.all([
    resolveSigningCalendar(deal.signing_with),
    findExistingAppointment(deal, side),
  ]);
  if (!initials) {
    return { ok: false, status: 503, error: "Signing appointments are not available right now." };
  }

  const location =
    existing?.appointment_type === "in_person" ? await getOfficeAddress() : null;

  return {
    ok: true,
    data: {
      dealId: deal.id,
      initials,
      booked: existing
        ? {
            startAt: existing.start_at,
            endAt: existing.end_at,
            appointmentType: existing.appointment_type,
            meetLink: existing.google_meet_link,
            location,
          }
        : null,
    },
  };
}

/**
 * Display names of the calendar each file books with, resolved in one pass for
 * many files (2 queries total). Used by the dashboard so the signing task's
 * button label is ready when the dashboard loads. Deliberately takes the
 * "Signing with" values in and returns only names out, so the raw admin field
 * never has to be put in a client response.
 */
export async function resolveSigningCalendarNames(
  dealIds: string[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  if (dealIds.length === 0) return out;

  const [{ data: deals }, { data: lawyers }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("deals").select("id, signing_with").in("id", dealIds),
    supabaseAdmin
      .from("signing_lawyers")
      .select("initials, full_name")
      .eq("is_active", true)
      .order("initials"),
    supabaseAdmin.from("signing_settings").select("default_signing_with").limit(1).maybeSingle(),
  ]);

  const active = (lawyers ?? []) as { initials: string; full_name: string }[];
  const find = (wanted: string | null | undefined) =>
    wanted
      ? active.find((l) => l.initials.toLowerCase() === wanted.trim().toLowerCase())
      : undefined;
  const fallback = find(settings?.default_signing_with as string | null) ?? active[0];

  for (const d of (deals ?? []) as { id: string; signing_with: string | null }[]) {
    out[d.id] = (find(d.signing_with) ?? fallback)?.full_name ?? null;
  }
  return out;
}
