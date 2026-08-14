import { NextResponse } from "next/server";
import { rateLimitOkStrict, requestIp } from "@/lib/rateLimit";
import { closingCostPdfFileName, generateClosingCostPdf } from "@/lib/closingCostPdf";
import {
  isEmailAddress,
  sendPublicEstimateEmail,
} from "@/lib/sendPublicEstimateEmail";
import {
  computePublicEstimate,
  parsePublicEstimatePayload,
} from "@/lib/publicClosingEstimate";
import { recordPublicEstimate } from "@/lib/recordPublicEstimate";

// POST /api/calculator/email — the public estimator's "Email it to me".
//
// PUBLIC BY DESIGN: middleware passes a cookie-less request through.
//
// ── The thing to be careful about ──────────────────────────────────────────
// This is an unauthenticated endpoint that makes the firm's domain send mail to
// an address a stranger chooses. That is a spam vector unless it is bounded, so
// three things bound it:
//
//   1. The BODY is fixed. Every word comes from the firm's own settings and the
//      calculation; the single free-text field is a name, restricted to
//      name-shaped characters in `parsePublicEstimatePayload` precisely so it
//      cannot carry a sentence or a link into someone else's inbox.
//   2. Per-IP limit — one sender cannot work through a list.
//   3. Per-RECIPIENT limit — a rotating set of IPs still cannot repeatedly mail
//      the same victim.
//
// Note how this differs from /api/closing-estimate/email, the signed-in client's
// "email it to me": that one accepts NO recipient at all and sends only to the
// address on the file. Here there is no file, so a recipient must be accepted —
// and the two rate limits are what stand in for the session that path has.
//
// Both limits use `rateLimitOkStrict`, which FAILS CLOSED. A route behind a
// session can afford to wave a request through when the counter is unreachable;
// an endpoint that makes the firm's domain send mail to a stranger's address
// cannot — there, a broken limiter and no limiter are the same thing. If the
// counter is down this button stops working, which is the failure everyone would
// choose.
//
// One row is written, to `calculator_estimates`: the figures, the totals, and —
// unlike the download path — the address, because here the visitor typed one.
// These are the rows the firm can actually follow up on.
//
// Still no lead: `leads` is the intake pipeline, and somebody who priced a
// purchase has signed nothing and asked for nothing. The row is written on the
// failure path too, since an address that Resend bounced was still a real
// address typed by a real person. The write cannot fail the request —
// `recordPublicEstimate` swallows everything.

/** A visitor emails themselves once, maybe twice after a correction. */
const IP_LIMIT = 5;
const IP_WINDOW_SECONDS = 3600;

/** Whoever is being mailed, from however many connections. */
const RECIPIENT_LIMIT = 3;
const RECIPIENT_WINDOW_SECONDS = 3600;

export async function POST(req: Request) {
  const ip = requestIp(req);
  if (!(await rateLimitOkStrict(`pub-cc-email-ip:${ip}`, IP_LIMIT, IP_WINDOW_SECONDS))) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many emails from this connection. Please try again later.",
      },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const to = String(body.to ?? "").trim();
  if (!isEmailAddress(to)) {
    return NextResponse.json(
      { success: false, error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  // Validated BEFORE the recipient budget is spent: a rejected request sends no
  // mail, so charging it against the address would let a mistyped figure cost a
  // genuine visitor one of their three sends.
  const parsed = parsePublicEstimatePayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  }

  // Keyed on the lowercased address so casing can't buy a fresh bucket.
  if (
    !(await rateLimitOkStrict(
      `pub-cc-email-to:${to.toLowerCase()}`,
      RECIPIENT_LIMIT,
      RECIPIENT_WINDOW_SECONDS,
    ))
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "This address has already been sent an estimate recently. Please check your inbox.",
      },
      { status: 429 },
    );
  }

  const { statement, config, statementType } = await computePublicEstimate(parsed.input);

  // The PDF is the document the firm stands behind, so a failure to build it is
  // NOT a reason to withhold the email — the body still carries the balance due
  // and the total. The caller is told which of the two they got.
  let pdf: { fileName: string; bytes: Uint8Array } | null = null;
  try {
    pdf = {
      fileName: closingCostPdfFileName(null),
      bytes: await generateClosingCostPdf({
        statement,
        config,
        statementType,
        clientName: parsed.input.clientName,
        fileNo: null,
        propertyAddress: null,
        closingDate: null,
        preparedOn: new Date().toLocaleDateString("en-CA", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        draft: true,
      }),
    };
  } catch (err) {
    console.error("[PublicCalculator email] PDF generation failed:", err);
  }

  const sent = await sendPublicEstimateEmail({
    to,
    statement,
    statementType,
    config,
    clientName: parsed.input.clientName,
    pdf,
  });

  // Recorded whichever way the send went — a bounced address was still typed by
  // a real person, and `email_sent` says which happened.
  await recordPublicEstimate({
    source: "email",
    req,
    input: parsed.input,
    statement,
    config,
    email: to,
    emailSent: sent.success,
    pdfAttached: Boolean(pdf),
  });

  if (!sent.success) {
    // The provider's message can name infrastructure, so it goes to the log and
    // the visitor gets something they can act on.
    console.error("[PublicCalculator email] send failed:", sent.error);
    return NextResponse.json(
      { success: false, error: "Could not send the email. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, sent_to: to, pdf_attached: Boolean(pdf) });
}
