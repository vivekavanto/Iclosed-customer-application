import { NextResponse, type NextRequest } from "next/server";

// Service-secret gate for the customer portal's /api/admin/* routes.
//
// Why this exists: this is a PUBLIC customer portal, but it also contains a
// handful of /api/admin/* routes that use the Supabase service-role client
// (bypasses Row Level Security) with NO auth and wide-open CORS — e.g.
// /api/admin/leads returns every lead's PII. They were guarded only by Vercel's
// Deployment Protection wall. Once that wall comes down (so customers can reach
// the activation/set-password flow), these routes would be publicly dumpable.
//
// An audit found NO caller for them in any app (the admin panel calls its OWN
// same-origin /api/admin/* routes; these portal copies are unreferenced legacy
// duplicates). So we fail CLOSED: deny unless a shared service secret is
// presented. If something operational does use one, it just adds the header.
//
// Customer-facing routes (/api/deals, /api/tasks, /api/auth/*, ...) are NOT
// matched here — they authenticate per-user and must stay public.

// The backfill route already self-protects with its own BACKFILL_SECRET query
// param and is run manually; let it handle its own auth rather than double-gate.
const SELF_PROTECTED = ["/api/admin/backfill-retainer-pdfs"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let CORS preflight through (carries no data; the real request is still
  // gated below).
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  if (SELF_PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const expected = process.env.ADMIN_SERVICE_KEY;
  const provided =
    request.headers.get("x-service-key") ??
    request.nextUrl.searchParams.get("service_key") ??
    "";

  // Fail closed: if the secret isn't configured, or doesn't match, deny.
  // These routes are dangerous (service-role + PII) and have no known caller.
  if (!expected || provided !== expected) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  // Scoped to the admin subtree ONLY. Customer and auth routes are untouched.
  matcher: ["/api/admin/:path*"],
};
