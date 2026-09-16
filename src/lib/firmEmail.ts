import { getFirm, type FirmKey } from "@/lib/firms";

/**
 * The addresses a firm's outbound mail is sent from and replied to.
 *
 * SERVER ONLY. Split out of firms.ts because that module is imported by the
 * retainer page and by closingEstimateEmail.ts — both of which render in the
 * browser — and `process.env` lookups have no business in a client bundle.
 *
 *   Nava Wilson  →  iclosed@navawilson.law
 *   iClosed LLP  →  hello@iclosed.ca
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

/**
 * Clean a recipient address read out of the database before sending to it.
 *
 * Ported from the admin app's emailIdentity.ts, which has had it since a client
 * could not be emailed at all. Intake stores whatever the client typed, and a
 * copy-pasted address routinely carries invisible padding — a trailing space, a
 * non-breaking space, a zero-width character. These render identically on screen
 * and survive form validation (JS `\s` does not match U+200B/U+FEFF), but GoTrue
 * rejects such an address outright with "Unable to validate email address:
 * invalid format" and the send dies before Resend is ever reached. From the
 * outside that is indistinguishable from a broken template or a bad API key.
 *
 * This app previously passed `lead.email` straight from the database to both
 * Resend and `auth.admin.generateLink` at every send site.
 *
 * Deliberately conservative: strip zero-width characters, fold non-breaking
 * spaces into ordinary ones, then trim the ends. Interior characters are left
 * alone — an address with a space in the middle is genuinely invalid and should
 * still fail loudly rather than be silently "repaired".
 *
 * ⚠ The two character classes below contain LITERAL invisible characters
 * (U+200B–U+200D, U+FEFF, and U+00A0), not `\u` escapes. They are correct and
 * tested — do not "clean up" what looks like an empty character class.
 */
export function normalizeRecipientEmail(email: string | null | undefined): string {
  return (email ?? "")
    .replace(/[​-‍﻿]/g, "")
    .replace(/ /g, " ")
    .trim();
}
