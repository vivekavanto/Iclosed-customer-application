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

// Customer-portal PAGES that require an authenticated session. Previously the
// dashboard only enforced auth client-side (a useEffect redirect in the layout),
// so an unauthenticated visitor could still load the page shell. We now redirect
// to /login server-side, before any dashboard markup renders.
const PROTECTED_PAGES = [
  "/dashboard",
  "/details",
  "/documents",
  "/profile",
  "/retainer",
];

/**
 * Server-side session guard for customer-portal pages. Redirects to /login
 * ONLY when there is no Supabase session cookie at all.
 *
 * Deliberately a cheap, side-effect-free check — we do NOT call
 * supabase.auth.getUser() here. Validating (and thereby refreshing) the token
 * inside middleware on every navigation rotates the refresh token, and if those
 * rewritten cookies aren't propagated perfectly it desyncs the session and logs
 * the user out on refresh even while their session is still valid. Real
 * per-request validation already happens in the API layer (getAuthClient →
 * getUser returns 401 for invalid/expired sessions) and client-side, so a stale
 * cookie can never actually load data. Middleware's only job is to stop a
 * completely unauthenticated visitor from rendering the dashboard shell —
 * presence of the session cookie is enough for that, and it never false-logs-out
 * a user whose session hasn't expired.
 */
function guardSession(request: NextRequest): NextResponse {
  // Supabase SSR stores the session in cookie(s) named `sb-<ref>-auth-token`
  // (chunked as `.0`, `.1`, … when large). Any one present means "has a session".
  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => /^sb-.*-auth-token/.test(c.name) && Boolean(c.value));

  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Retainer "sign without an account" exception ──
  // A retainer link emailed to a client carries a ?token= and is meant to be
  // opened with NO account. The token itself is the credential (validated
  // server-side against invitation_tokens), so this page must skip the session
  // guard when a token is present. Without a token, /retainer stays protected
  // (logged-in clients sign from inside the dashboard as before).
  if (pathname === "/retainer" && request.nextUrl.searchParams.has("token")) {
    return NextResponse.next();
  }

  // ── Customer page auth guard ──
  if (
    PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return guardSession(request);
  }

  // ── /api/admin/* service-secret gate (everything below) ──
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
  // /api/admin/* → service-secret gate.
  // Customer-portal pages → server-side session guard (redirect to /login).
  // Base path + subpaths are listed explicitly so e.g. /dashboard itself is
  // matched, not only /dashboard/<something>.
  matcher: [
    "/api/admin/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/details",
    "/details/:path*",
    "/documents",
    "/documents/:path*",
    "/profile",
    "/profile/:path*",
    "/retainer",
    "/retainer/:path*",
  ],
};
