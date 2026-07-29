import { createHmac } from "crypto";

// Caller-side signing for service-to-service POSTs to the admin app (SEC-002).
//
// The admin app verifies these requests in src/lib/verifyServiceSignature.ts.
// This MUST mirror that contract exactly:
//   • payload   = `${timestamp}.${rawBody}`   (timestamp = ms-epoch string)
//   • signature = HMAC-SHA256(SERVICE_WEBHOOK_SECRET, payload) as lowercase hex
//   • headers   = X-iClosed-Signature + X-iClosed-Timestamp
// Both apps must share the same SERVICE_WEBHOOK_SECRET env var.
//
// IMPORTANT: the `rawBody` passed here must be the EXACT string sent as the
// request body — build the JSON string once, sign it, and send that same string
// (never re-serialize), or the admin will hash a different payload and reject it.
//
// While the admin runs in warn-only mode (SERVICE_WEBHOOK_ENFORCE unset), an
// unsigned request still passes; once it flips to enforce, only signed requests
// are accepted. Signing here is safe to ship before that flip.

const SECRET = process.env.SERVICE_WEBHOOK_SECRET ?? "";

/**
 * Headers for a signed service POST. Pass the raw JSON body string; send that
 * SAME string as the fetch body. Always returns Content-Type; adds the signature
 * + timestamp when SERVICE_WEBHOOK_SECRET is configured.
 */
export function signedServiceHeaders(rawBody: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!SECRET) {
    // Misconfiguration, not fatal: request goes out unsigned and will be
    // accepted while the admin is in warn-only mode. Surface it loudly.
    console.warn(
      "[signServiceRequest] SERVICE_WEBHOOK_SECRET not set — sending UNSIGNED service request",
    );
    return headers;
  }

  const timestamp = String(Date.now());
  const signature = createHmac("sha256", SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  headers["X-iClosed-Timestamp"] = timestamp;
  headers["X-iClosed-Signature"] = signature;
  return headers;
}
