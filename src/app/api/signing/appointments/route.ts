import { NextResponse } from "next/server";
import { adminAppUrl } from "@/lib/adminAppUrl";

// POST /api/signing/appointments
//
// PUBLIC, unauthenticated — proxies straight through to the admin app's own
// public route (src/app/api/signing/appointments/route.ts in the admin repo),
// which re-validates the slot, creates the Google Calendar event and inserts
// the signing_appointments row. See the availability proxy in this same
// directory tree for why this is a server-to-server passthrough rather than a
// duplicated implementation.

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const target = new URL("/api/signing/appointments", adminAppUrl());

  try {
    const res = await fetch(target.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not reach the booking service. Please try again." },
      { status: 502 },
    );
  }
}
