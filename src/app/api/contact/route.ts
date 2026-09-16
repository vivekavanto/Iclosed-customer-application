import { NextResponse } from "next/server";
import { rateLimitOk, requestIp } from "@/lib/rateLimit";
import { sendContactMessageEmail } from "@/lib/sendContactMessageEmail";

// This route can reach the email transport, and the SMTP provider uses
// nodemailer — which needs raw TCP and CANNOT run on the Edge runtime.
// Resend never exposed this because it is an HTTPS fetch client.
export const runtime = "nodejs";


// POST /api/contact — the public "Contact us" form.
//
// PUBLIC BY DESIGN: middleware passes a cookie-less request straight through
// (it guards /api/admin/* and refreshes sessions; it does not require one).
//
// Unlike /api/calculator/email this route cannot mail a stranger: the ONLY
// recipient is the firm's own support inbox, fixed in code, and the visitor's
// address is used solely as Reply-To. The abuse it has to survive is therefore
// inbox flooding, not relaying — which is why the per-IP limit here fails OPEN
// (`rateLimitOk`). A broken counter should not take the website's only contact
// channel offline; the worst case is noise in an inbox a human already reads.
//
// A hidden honeypot field ("company") catches the drive-by form-fillers that
// never look at CSS, and is accepted-then-discarded so a bot sees a success.

/** A real person writes in once or twice, not fifteen times an hour. */
const IP_LIMIT = 5;
const IP_WINDOW_SECONDS = 3600;

const MAX_NAME = 120;
const MAX_EMAIL = 200;
const MAX_PHONE = 40;
const MAX_MESSAGE = 4000;
const MIN_MESSAGE = 5;

/** Deliberately loose — enough to reject a typo, not to police valid addresses. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Canonicalises a North American number to (416) 555-1234 — the one format the
 * rest of the product stores and displays.
 *
 * The browser already formats as the visitor types, so this normally just
 * agrees with what arrived. It exists because the browser is not the only
 * caller: it accepts a bare 10-digit string, a 1-prefixed 11-digit one, and any
 * punctuation around either, and rejects everything else rather than forwarding
 * a half-typed number into the support inbox, where nobody can call it back.
 *
 * Returns null when something was supplied but is not a usable number, and the
 * empty string when nothing was supplied at all — the field is optional.
 */
function normalizePhone(raw: string): string | null {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("Invalid request.", 400);
  }

  // Honeypot: only a bot fills a field no human can see. Answer 200 so it has
  // nothing to tune against, and send nothing.
  if (str(body.company)) {
    return NextResponse.json({ success: true });
  }

  const name = str(body.name);
  const email = str(body.email);
  const phone = str(body.phone);
  const message = str(body.message);

  if (!name) return fail("Please enter your name.", 400);
  if (name.length > MAX_NAME) return fail("That name is too long.", 400);

  if (!email) return fail("Please enter your email address.", 400);
  if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
    return fail("Please enter a valid email address.", 400);
  }

  if (phone.length > MAX_PHONE) return fail("That phone number is too long.", 400);
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone === null) {
    return fail("Enter phone in (416) 555-1234 format.", 400);
  }

  if (message.length < MIN_MESSAGE) return fail("Please enter your message.", 400);
  if (message.length > MAX_MESSAGE) {
    return fail("Your message is too long. Please keep it under 4000 characters.", 400);
  }

  // Counted here rather than at the top of the handler: check_rate_limit()
  // increments on every call, so a limit checked before validation would spend a
  // person's whole hourly allowance on their own typos — five corrected email
  // addresses and the form stops working for them. Only a submission that is
  // actually about to send mail costs a slot. Malformed requests still cost
  // nothing to reject, so nothing is gained by flooding them.
  const ip = requestIp(req);
  if (!(await rateLimitOk(`contact-form-ip:${ip}`, IP_LIMIT, IP_WINDOW_SECONDS))) {
    return fail(
      "Too many messages from this connection. Please try again later, or email hello@iclosed.ca.",
      429,
    );
  }

  const sent = await sendContactMessageEmail({
    name,
    email,
    phone: normalizedPhone || "—",
    message,
  });

  if (!sent) {
    return fail(
      "We couldn't send your message right now. Please email hello@iclosed.ca directly.",
      502,
    );
  }

  return NextResponse.json({ success: true });
}
