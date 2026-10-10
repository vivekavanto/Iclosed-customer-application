import { NextResponse } from "next/server";
import { getSigningBookingState } from "@/lib/signingCalendar";

export const dynamic = "force-dynamic";

// GET /api/signing/for-deal?deal=<id>&side=purchase|sale
//
// For the logged-in client's signing task: which calendar to book against and
// whether this property already has an appointment. The calendar is the file's
// admin-only "Signing with" (or the default) — only its initials are returned,
// never a name, because the client must not see who it is.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const result = await getSigningBookingState(
    url.searchParams.get("deal"),
    url.searchParams.get("side"),
  );
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true, data: result.data });
}
