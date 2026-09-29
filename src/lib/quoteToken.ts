import crypto from "node:crypto";

// Signed, read-only link to a lead's quote page. Distinct from activation tokens.
const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DOMAIN = "quote:";

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(DOMAIN + payload).digest("base64url");
}

export function signQuoteToken(leadId: string): string {
  const payload = Buffer.from(leadId, "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the lead id, or null if the token is missing or tampered. */
export function verifyQuoteToken(token: string | null | undefined): string | null {
  if (!token || !secret()) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }
  return Buffer.from(payload, "base64url").toString("utf8") || null;
}
