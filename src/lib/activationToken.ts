import crypto from "node:crypto";

/**
 * Stateless, unguessable activation tokens for the first-time account-setup link.
 *
 * Why this exists: Supabase's own invite/recovery action links are SINGLE-USE —
 * the token is burned at Supabase's /auth/v1/verify on the FIRST click, even if
 * the user never actually sets a password. So emailing the raw one-time link
 * means a second click lands on an "expired" error and gets bounced to
 * forgot-password (see AuthHashHandler). Instead, the activation email points at
 * a STABLE link — /api/auth/activate?token=<token> — that mints a FRESH Supabase
 * link server-side on every click, so the set-password page keeps working until a
 * password is actually set (see the activate route).
 *
 * The token binds to exactly one lead id and is HMAC-signed with the server-only
 * service-role key (never shipped to the browser), so it can't be forged or
 * enumerated. It's deterministic, so re-sending the invite reuses the same link.
 */
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** Mint the `<payload>.<sig>` activation token for a lead. */
export function signActivationToken(leadId: string): string {
  const payload = Buffer.from(leadId, "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Verify a token and return its lead id, or null if missing/tampered. */
export function verifyActivationToken(
  token: string | null | undefined,
): string | null {
  if (!token) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload));

  // Constant-time compare; timingSafeEqual throws unless lengths match.
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  try {
    return Buffer.from(payload, "base64url").toString("utf8") || null;
  } catch {
    return null;
  }
}
