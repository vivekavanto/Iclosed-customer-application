import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  throw new Error("Missing env var: RESEND_API_KEY");
}

export const resend = new Resend(apiKey);

export const EMAIL_FROM =
  process.env.EMAIL_FROM || "iClosed <noreply@iclosed.ca>";

/**
 * Where replies go — the SAME address on every outbound email, client-facing or
 * internal. It used to be testing@navawilson.law, a pre-launch leftover, so a
 * client hitting "Reply" on e.g. their signed retainer agreement wrote to an
 * inbox nobody watches. Override per environment with EMAIL_REPLY_TO.
 */
export const EMAIL_REPLY_TO =
  process.env.EMAIL_REPLY_TO?.trim() || "support@iclosed.ca";

/**
 * Back-office inbox that RECEIVES staff-facing alerts (new lead, citizenship
 * flag, name-change request). This is a recipient, not a reply-to — the two
 * were the same constant before, which is why the reply address could not be
 * corrected without also redirecting those alerts. Kept at its existing value
 * so this change moves no mail; override with INTERNAL_ALERT_EMAIL.
 */
export const INTERNAL_ALERT_TO =
  process.env.INTERNAL_ALERT_EMAIL?.trim() || "testing@navawilson.law";

/**
 * Public "Contact us" inbox — where website enquiries land. Separate constant
 * from INTERNAL_ALERT_TO on purpose: that one receives system alerts (new lead,
 * citizenship flag) and can be pointed at a staging address, while this is the
 * address printed on the site and answered by a human. Override with
 * CONTACT_EMAIL.
 */
export const CONTACT_INBOX_TO =
  process.env.CONTACT_EMAIL?.trim() || "support@iclosed.ca";
