import { NextResponse } from "next/server";
import { adminAppUrl } from "@/lib/adminAppUrl";

// GET /api/signing/lawyers
//
// PUBLIC, unauthenticated — proxies to the admin app's own public route
// (src/app/api/signing/lawyers/route.ts in the admin repo) for the
// "choose your lawyer" landing page at /signing. See the availability proxy
// in this same directory tree for why this is a passthrough rather than a
// duplicated implementation.

export async function GET() {
  const target = new URL("/api/signing/lawyers", adminAppUrl());
  try {
    // The lawyer list rarely changes — cache it so the page doesn't wait on
    // a round-trip to the admin app on every visit.
    const res = await fetch(target.toString(), { next: { revalidate: 300 } });
    const json = await res.json();
    return NextResponse.json(json, {
      status: res.status,
      headers: res.ok
        ? { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" }
        : undefined,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not reach the booking service. Please try again." },
      { status: 502 },
    );
  }
}
