import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  SESSION_DEADLINE_COOKIE,
  SESSION_EXPIRED_HEADER,
  authCookieChunks,
  isDeadlinePassed,
  readAccessTokenExpiry,
  sessionDeadlineCookie,
} from "@/lib/sessionPolicy";

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
// gated here — they authenticate per-user and must stay public.

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
  // Blog admin. Defence in depth only: this check knows whether there is a
  // session, not whether it belongs to staff. The real gate is the
  // getAdminSession() call in src/app/(admin)/admin/blog/layout.tsx, which is
  // what separates a signed-in client from a member of admin_users.
  "/admin",
];

// Refresh this far ahead of the access token's expiry. Doing it while the old
// token is still valid is what makes concurrent requests safe: the ones that
// don't win the refresh race still hold a working token.
const REFRESH_SKEW_MS = 60_000;

// Routes that ESTABLISH or DESTROY a session and therefore write the auth
// cookies themselves. Middleware must keep its hands off them: signing in while
// holding a lapsed session would otherwise have us emit cookie deletions on the
// very response that sets the new ones — locking out precisely the users whose
// session just expired.
const SESSION_SELF_MANAGED = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/callback",
  "/api/auth/activate",
];

/* ────────────────────────────── cookie helpers ───────────────────────────── */

function authCookies(request: NextRequest) {
  return authCookieChunks(request.cookies.getAll());
}

function hasSessionCookie(request: NextRequest): boolean {
  return authCookies(request).length > 0;
}

function loginRedirect(request: NextRequest, expired: boolean): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  if (expired) loginUrl.searchParams.set("expired", "1");
  return NextResponse.redirect(loginUrl);
}

/* ─────────────────────────────── session work ────────────────────────────── */

/**
 * THE single place the Supabase token is refreshed.
 *
 * It used to be refreshed nowhere and everywhere at once: middleware skipped it
 * on purpose, every API route's getAuthUser() independently exchanged the SAME
 * refresh token, and a browser client ran its own refresh ticker on the same
 * cookie. Supabase rotates refresh tokens, so those writers raced — each
 * response carried a different Set-Cookie, last one home won, and whoever ended
 * up holding an already-consumed token got a 401 and was logged out mid-session.
 *
 * One writer, refreshing early (REFRESH_SKEW_MS before expiry), removes the
 * race: any concurrent refreshes land inside Supabase's reuse interval and so
 * receive the identical new session, and requests that skip the refresh still
 * hold a valid token.
 *
 * Mutating `request.cookies` before rebuilding the response is what lets the
 * route handler / RSC running after this middleware see the rotated token in
 * the SAME request, instead of one stale hop behind.
 */
async function refreshSession(request: NextRequest): Promise<{
  response: NextResponse;
  sessionValid: boolean;
}> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Misconfigured env must not log everyone out — fall through untouched and
  // let the API layer decide.
  if (!url || !anonKey) return { response, sessionValid: true };

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.getUser();
    if (data.user) return { response, sessionValid: true };

    // No user came back — but "couldn't ask" is not "session is dead", and
    // conflating the two is half of what was logging people out. getUser()
    // resolves (rather than throws) on network failure, 5xx and rate limits, so
    // only a definitive auth rejection may end the session.
    const status = (error as { status?: number } | null)?.status;
    const rejected =
      !error || status === 400 || status === 401 || status === 403;
    return { response, sessionValid: !rejected };
  } catch {
    // Threw outright (DNS, abort, edge fetch failure) — same reasoning: keep
    // the session and let the API layer answer for this one request.
    return { response, sessionValid: true };
  }
}

/**
 * Tears the session down: clears it for the handler about to run AND for the
 * browser, then either bounces a page to /login or flags the API response so
 * the client knows this particular 401 really is an expiry.
 */
function endSession(request: NextRequest, isPage: boolean): NextResponse {
  const names = [
    ...authCookies(request).map((c) => c.name),
    SESSION_DEADLINE_COOKIE,
  ];
  names.forEach((name) => request.cookies.delete(name));

  const response = isPage
    ? loginRedirect(request, true)
    : NextResponse.next({ request });

  names.forEach((name) => response.cookies.delete(name));
  if (!isPage) response.headers.set(SESSION_EXPIRED_HEADER, "1");

  return response;
}

async function handleSession(
  request: NextRequest,
  isPage: boolean,
): Promise<NextResponse> {
  const now = Date.now();

  if (!hasSessionCookie(request)) {
    // No session at all. A page needs one; an API route may legitimately be
    // anonymous (intake, referral, activation), so let it answer for itself —
    // and never flag it as "expired", because nothing expired.
    return isPage ? loginRedirect(request, false) : NextResponse.next();
  }

  // ── Absolute cap: 3h per login, active or not ──
  const deadline = request.cookies.get(SESSION_DEADLINE_COOKIE)?.value;
  if (isDeadlinePassed(deadline, now)) {
    return endSession(request, isPage);
  }

  const expiresAt = readAccessTokenExpiry(request.cookies.getAll());
  const needsRefresh = expiresAt === null || now >= expiresAt - REFRESH_SKEW_MS;

  let response: NextResponse;
  if (needsRefresh) {
    const result = await refreshSession(request);
    if (!result.sessionValid) return endSession(request, isPage);
    response = result.response;
  } else {
    response = NextResponse.next({ request });
  }

  // Grace window. Sessions that predate this cookie — and the invite /
  // magic-link / set-password flows, which establish their session in the
  // browser and so never touch a server route that could stamp it — have no
  // deadline yet. Stamp one now rather than logging them out instantly.
  if (!deadline) {
    const cookie = sessionDeadlineCookie(now);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  return response;
}

/* ──────────────────────────── /api/admin/* gate ──────────────────────────── */

function adminGate(request: NextRequest): NextResponse {
  // Let CORS preflight through (carries no data; the real request is still
  // gated below).
  if (request.method === "OPTIONS") return NextResponse.next();

  const { pathname } = request.nextUrl;
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

/* ─────────────────────────────── entry point ─────────────────────────────── */

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Retainer "sign without an account" exception ──
  // A retainer link emailed to a client carries a ?token= and is meant to be
  // opened with NO account. The token itself is the credential (validated
  // server-side against invitation_tokens), so this page must skip the session
  // guard when a token is present. Without a token, /retainer stays protected
  // (logged-in clients sign from inside the dashboard as before).
  //
  // Match ANY /retainer path (not just the exact page) so a token link can
  // never get caught by the PROTECTED_PAGES guard below and bounced to /login.
  // Legacy links pointed at /retainer/sign (the path was later flattened to
  // /retainer); normalize those to the canonical /retainer page, PRESERVING the
  // ?token= query, instead of 404-ing or redirecting to login.
  if (
    (pathname === "/retainer" || pathname.startsWith("/retainer/")) &&
    request.nextUrl.searchParams.has("token")
  ) {
    if (pathname !== "/retainer") {
      const canonical = new URL("/retainer", request.url);
      canonical.search = request.nextUrl.search; // keep ?token=…
      return NextResponse.redirect(canonical);
    }
    return NextResponse.next();
  }

  // ── /api/admin/* service-secret gate ──
  // Scoped explicitly: the matcher now covers ALL of /api/*, so this can no
  // longer be the catch-all fall-through it used to be — that would 401 every
  // customer API route.
  if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) {
    return adminGate(request);
  }

  if (
    SESSION_SELF_MANAGED.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    )
  ) {
    return NextResponse.next();
  }

  const isPage = PROTECTED_PAGES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  return handleSession(request, isPage);
}

export const config = {
  // /api/admin/*        → service-secret gate.
  // /api/*              → single refresh point + expiry flagging.
  // Customer pages      → server-side session guard (redirect to /login).
  // Base path + subpaths are listed explicitly so e.g. /dashboard itself is
  // matched, not only /dashboard/<something>.
  matcher: [
    "/api/:path*",
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
    "/admin",
    "/admin/:path*",
  ],
};
