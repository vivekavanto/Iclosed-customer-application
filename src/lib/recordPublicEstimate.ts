// Records what an anonymous visitor estimated on the public calculator.
//
// ── The one property that matters ──────────────────────────────────────────
// This must NEVER be able to break the calculator. A visitor came to price
// their purchase; whether the firm manages to file that away is the firm's
// problem, not theirs. So every failure — missing table, bad RLS, Supabase down,
// a column added on one side and not the other — is logged and swallowed, and
// the caller carries on and returns the PDF.
//
// That is also why callers `await` this rather than firing it off unawaited:
// on Vercel, work still running after a response has been returned can be killed
// mid-flight, so a detached insert would drop rows silently and unpredictably.
// It is one insert on an already-open connection, and it cannot throw.
//
// What this does NOT do: notify anyone. No alert email, no `notifications` row,
// no webhook to the admin app. The rows sit in `calculator_estimates` to be read
// when someone goes looking.

import supabaseAdmin from "./supabaseAdmin";
import { requestIp } from "./rateLimit";
import type { Statement } from "./closingCosts";
import type { PublicEstimateInput } from "./publicClosingEstimate";

/** How the visitor took the estimate away. */
export type PublicEstimateSource = "pdf" | "email";

export interface RecordPublicEstimateParams {
  source: PublicEstimateSource;
  /** The request itself — IP, user-agent and referer are read off it. */
  req: Request;
  /** The validated inputs, straight from `parsePublicEstimatePayload`. */
  input: PublicEstimateInput;
  /** The computed statement, so the row holds the figures the visitor saw. */
  statement: Statement;
  /** The merged firm row; only `firm_key` is taken from it. */
  config: Record<string, unknown>;
  /** Email path only: the address the estimate was sent to. */
  email?: string | null;
  /** Email path only: whether Resend accepted the send. */
  emailSent?: boolean | null;
  /** Email path only: whether the PDF made it onto the message. */
  pdfAttached?: boolean | null;
}

/**
 * Header values are attacker-controlled and unbounded. Long enough to keep a
 * real user-agent whole, short enough that nobody can post a novel into a row.
 */
const MAX_HEADER_LENGTH = 500;

function header(req: Request, name: string): string | null {
  const value = req.headers.get(name);
  if (!value) return null;
  return value.slice(0, MAX_HEADER_LENGTH);
}

export async function recordPublicEstimate(
  params: RecordPublicEstimateParams,
): Promise<void> {
  const { source, req, input, statement, config } = params;

  try {
    const firmKey =
      typeof config.firm_key === "string" && config.firm_key.trim()
        ? config.firm_key.trim()
        : null;

    const { error } = await supabaseAdmin.from("calculator_estimates").insert({
      source,

      client_name: input.clientName,
      email: params.email ?? null,

      purchase_price: input.purchasePrice,
      deposit_paid: input.depositPaid,
      mortgage_amount: input.mortgageAmount,
      is_toronto: input.isToronto,
      is_first_time_buyer: input.isFirstTimeBuyer,

      total_closing_costs: statement.total,
      balance_due: statement.balance.balanceDue,
      property_tax_adjustment: statement.balance.propertyTaxAdjustment,
      breakdown: statement.detail,
      calc_version: statement.calcVersion,
      firm_key: firmKey,

      email_sent: params.emailSent ?? null,
      pdf_attached: params.pdfAttached ?? null,

      ip: requestIp(req),
      user_agent: header(req, "user-agent"),
      referer: header(req, "referer"),
    });

    if (error) {
      console.error("[recordPublicEstimate] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[recordPublicEstimate] unexpected error:", err);
  }
}
