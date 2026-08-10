/**
 * Single source of truth for "when does a login session end?".
 *
 * Before this file there were three uncoordinated timers (Supabase's JWT
 * expiry, the idle guard's localStorage clock, and "any 401 means logged out"),
 * so the real logout time was whichever one tripped first — never the intended
 * "3 hours per login". Everything session-lifetime now reads from here.
 *
 * Safe to import from BOTH server (middleware, route handlers) and client
 * components: it only reads a NEXT_PUBLIC_ env var, so the value is identical
 * on both sides.
 */

/** A session dies this long after login — active or not. */
export const DEFAULT_SESSION_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours

export const SESSION_MAX_AGE_MS =
  Number(process.env.NEXT_PUBLIC_SESSION_MAX_AGE_MS) ||
  DEFAULT_SESSION_MAX_AGE_MS;

/**
 * Holds the absolute deadline (epoch ms) of the current login. httpOnly so the
 * page can't extend its own session; the browser also drops it on its own via
 * maxAge, which is a second line of defence if middleware is ever bypassed.
 */
export const SESSION_DEADLINE_COOKIE = "iclosed-session-expires-at";

/**
 * Set on a response ONLY when a 401 is caused by a genuinely dead session.
 * The client's logout guard keys off this header instead of treating every
 * /api/* 401 as an expiry — a transient Supabase blip, an admin hitting the
 * customer portal, or any other "not authenticated" 401 must not log a user out
 * of a perfectly valid session.
 */
export const SESSION_EXPIRED_HEADER = "x-session-expired";

/**
 * Supabase SSR session cookie: `sb-<ref>-auth-token`, chunked as `.0`, `.1`, …
 * when the payload is large.
 *
 * Anchored at both ends on purpose. A loose `/^sb-.*-auth-token/` also matches
 * `sb-<ref>-auth-token-code-verifier` (the PKCE cookie, which is present with
 * NO session), which would read as "this visitor is logged in".
 */
export const AUTH_COOKIE_RE = /^sb-.+-auth-token(\.\d+)?$/;

/** localStorage keys owned by the client-side guard. */
export const LAST_ACTIVITY_KEY = "iclosed:lastActivity";
export const SESSION_START_KEY = "iclosed:sessionStart";

export function sessionDeadlineCookie(now: number) {
  return {
    name: SESSION_DEADLINE_COOKIE,
    value: String(now + SESSION_MAX_AGE_MS),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
    },
  };
}

/**
 * True only when we have a deadline AND it has passed. An absent/garbage value
 * is deliberately NOT "expired" — callers grant a fresh window instead, so
 * sessions that predate this cookie aren't logged out en masse on deploy.
 */
export function isDeadlinePassed(
  raw: string | undefined,
  now: number,
): boolean {
  if (!raw) return false;
  const deadline = Number(raw);
  return Number.isFinite(deadline) && now >= deadline;
}

/* ─────────────────────── reading the session cookie ──────────────────────── */

type NamedCookie = { name: string; value: string };

// `sb-<ref>-auth-token.10` must sort AFTER `.2`, so compare the chunk index
// numerically — sorting these names as strings silently corrupts the payload.
function chunkIndex(name: string): number {
  const match = /\.(\d+)$/.exec(name);
  return match ? Number(match[1]) : 0;
}

/** The session cookie's chunks, in payload order. */
export function authCookieChunks(cookies: NamedCookie[]): NamedCookie[] {
  return cookies
    .filter((c) => AUTH_COOKIE_RE.test(c.name) && Boolean(c.value))
    .sort((a, b) => chunkIndex(a.name) - chunkIndex(b.name));
}

/**
 * Reads the access token's expiry (epoch ms) straight out of the session
 * cookie, with no network call — that's what lets middleware refresh only when
 * a token is actually near expiry instead of calling Supabase on every request.
 *
 * Returns null when the cookie is missing or unreadable. Callers must treat
 * null as "refresh to be safe", never as "the session is fine".
 */
export function readAccessTokenExpiry(cookies: NamedCookie[]): number | null {
  const chunks = authCookieChunks(cookies);
  if (chunks.length === 0) return null;

  let raw = chunks.map((c) => c.value).join("");
  try {
    if (raw.startsWith("base64-")) {
      raw = decodeBase64Utf8(raw.slice("base64-".length));
    }
    const expiresAt = JSON.parse(raw)?.expires_at;
    return typeof expiresAt === "number" ? expiresAt * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * atob() yields a byte string, so a name like "Renée" comes back mojibake and
 * JSON.parse can choke on it. Percent-encoding the bytes and handing them to
 * decodeURIComponent reconstructs UTF-8 without TextDecoder, which the jsdom
 * test environment doesn't provide.
 */
function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64);
  let percentEncoded = "";
  for (let i = 0; i < binary.length; i++) {
    percentEncoded +=
      "%" + binary.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return decodeURIComponent(percentEncoded);
}
