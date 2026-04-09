import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  throw new Error("Missing env var: RESEND_API_KEY");
}

export const resend = new Resend(apiKey);

export const EMAIL_FROM =
  process.env.EMAIL_FROM || "iClosed <noreply@iclosed.ca>";

export const EMAIL_REPLY_TO = "iclosed@navawilson.law";
