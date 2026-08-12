import supabaseAdmin from "./supabaseAdmin";

// Postgres-backed rate limiting via the shared `check_rate_limit()` function
// (owned by the admin repo: migrations/2026-07-23-rate-limits.sql, with the
// service_role GRANT added in 2026-08-11-fix-rate-limit-permissions.sql). Both
// apps point at the SAME database, so the counter is shared across the portal,
// the admin panel and every serverless instance of either.

/**
 * Returns true if the request is ALLOWED, false if it should be blocked.
 * Fail-OPEN: a rate-limit check that itself errors lets the request through
 * rather than locking everyone out on an infra hiccup.
 *
 * @param key            identifier for the bucket, e.g. `pub-cc-pdf:${ip}`
 * @param limit          max requests allowed within the window
 * @param windowSeconds  the rolling window length in seconds
 */
export async function rateLimitOk(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rateLimit] check_rate_limit failed (allowing):", error.message);
      return true; // fail open
    }
    return data === true;
  } catch (err) {
    console.error("[rateLimit] unexpected error (allowing):", err);
    return true; // fail open
  }
}

/**
 * As `rateLimitOk`, but FAILS CLOSED: a rate-limit check that errors blocks the
 * request instead of allowing it.
 *
 * Fail-open is the right default for a route behind a session — locking a
 * client out of their own file over a database hiccup costs more than the limit
 * protects. It is the WRONG default for an unauthenticated endpoint with an
 * outward side effect, where "the limiter is broken" and "there is no limiter"
 * are the same thing to an abuser, and the only signal that the counter is down
 * is the abuse itself.
 *
 * That is not hypothetical: `check_rate_limit()` shipped without a service_role
 * GRANT and returned 42501 on every call, so every limit in both apps was a
 * silent no-op until the permissions migration. A caller that fails closed turns
 * that class of misconfiguration into a visible outage on one button rather than
 * an open relay.
 *
 * Use it only where the degraded state is acceptable — the public calculator
 * still renders and still downloads its PDF when this blocks the email button.
 */
export async function rateLimitOkStrict(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rateLimit] check_rate_limit failed (BLOCKING):", error.message);
      return false; // fail closed
    }
    return data === true;
  } catch (err) {
    console.error("[rateLimit] unexpected error (BLOCKING):", err);
    return false; // fail closed
  }
}

/** First client IP from proxy headers, for keying limits by IP. */
export function requestIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}
