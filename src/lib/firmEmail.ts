import { getFirm, type FirmKey } from "@/lib/firms";

/**
 * The addresses a firm's outbound mail is sent from and replied to.
 *
 * SERVER ONLY. Split out of firms.ts because that module is imported by the
 * retainer page and by closingEstimateEmail.ts — both of which render in the
 * browser — and `process.env` lookups have no business in a client bundle.
 *
 *   Nava Wilson  →  iclosed@navawilson.law
 *   iClosed LLP  →  support@iclosed.ca
 *
 * ⚠ OPS PREREQUISITE: navawilson.law must be a VERIFIED sending domain in
 * Resend before Nava Wilson files start sending from it, or those sends fail.
 * Until it is, point the firm at an already-verified address with
 * EMAIL_FROM_NAVAWILSON — no code change needed.
 *
 * Env overrides, all optional:
 *   EMAIL_FROM_NAVAWILSON / EMAIL_FROM_ICLOSED
 *   EMAIL_REPLY_TO_NAVAWILSON / EMAIL_REPLY_TO_ICLOSED
 *
 * These deliberately do NOT fall back to the legacy firm-agnostic EMAIL_FROM /
 * EMAIL_REPLY_TO. That value is a SINGLE address; letting it stand in for a
 * firm would collapse both firms back onto one sender on any deploy that still
 * has it set — which is every current deploy — silently undoing the split.
 * EMAIL_FROM still applies to the sends that belong to no file (the public
 * calculator) and to the internal staff alerts.
 */

/** From address for a firm's outbound mail. */
export function firmFrom(firm: FirmKey | null | undefined): string {
  const profile = getFirm(firm);
  return process.env[profile.fromEnvVar]?.trim() || profile.fromEmail;
}

/** Reply-to address for a firm's outbound mail. */
export function firmReplyTo(firm: FirmKey | null | undefined): string {
  const profile = getFirm(firm);
  return process.env[profile.replyToEnvVar]?.trim() || profile.replyToEmail;
}
