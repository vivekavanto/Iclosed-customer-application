import { NextResponse } from "next/server";
import { adminAppUrl } from "@/lib/adminAppUrl";

// GET /api/signing/lawyers/[initials]/availability?date=YYYY-MM-DD
//
// PUBLIC, unauthenticated — proxies to the admin app's own public route of
// the same shape (src/app/api/signing/lawyers/[initials]/availability/route.ts
// in the admin repo). That route owns the real logic (lawyer hours, blocked
// times, existing bookings, Google Calendar freebusy) because it alone holds
// the Supabase service-role client and the Google service-account credentials
// — this portal has neither. Server-to-server only, so no CORS is needed on
// the admin side and no secret crosses into the browser.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ initials: string }> },
) {
  const { initials } = await params;
  const url = new URL(req.url);
  const date = url.searchParams.get("date");

  const target = new URL(
    `/api/signing/lawyers/${encodeURIComponent(initials)}/availability`,
    adminAppUrl(),
  );
  if (date) target.searchParams.set("date", date);

  try {
    const res = await fetch(target.toString(), { cache: "no-store" });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not reach the booking service. Please try again." },
      { status: 502 },
    );
  }
}
