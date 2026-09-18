/**
 * The one place an email leaves the customer portal.
 *
 * Mirrors the admin app's src/lib/email/emailTransport.ts — same types, same
 * file layout, same rules — so the two can be diffed when either changes. They
 * cannot share code (separate deployments, no shared package), exactly as
 * firms.ts, leadFirm.ts and emailBrand.ts are already mirrored.
 *
 * ── WHERE THIS DIFFERS FROM THE ADMIN COPY ──────────────────────────────
 * The two apps name the same concepts differently, and this file is where that
 * shows. The admin app has `emailIdentity.emailFrom(firm)` with a no-arg legacy
 * overload; the portal has `firmEmail.firmFrom(firm)` (firm required) plus a
 * separate firm-agnostic EMAIL_FROM for the sends that belong to no file. The
 * per-firm env vars are named differently too — EMAIL_FROM_NAVAWILSON here,
 * RESEND_FROM_EMAIL_NAVAWILSON there. Both are deliberate and documented in
 * their own firms.ts; do NOT unify them, because renaming a variable that is
 * already set in production silently reverts a firm to its hardcoded default.
 *
 * Only the NEW SMTP variables share names across the repos (SMTP_*_NAVAWILSON,
 * EMAIL_SMTP_FIRMS, EMAIL_SMTP_SENDS). There is no legacy there to preserve.
 *
 * ── WHY IDENTITY AND TRANSPORT RESOLVE TOGETHER ─────────────────────────
 * The From domain and the sending server have to agree or SPF/DKIM alignment
 * fails and the mail is spam-foldered. Deriving both from one value makes that
 * mismatch impossible to construct.
 *
 * ── WHY THIS FACADE DOES NOT THROW ──────────────────────────────────────
 * It matters more here than in the admin app. Eleven of this repo's thirteen
 * send sites have NO try/catch — they call the SDK and swallow its `{ error }`.
 * A throwing facade would raise unhandled exceptions inside api/intake and
 * api/retainer/sign, which are best-effort by contract, and take down intake and
 * retainer signing. So: providers throw, `sendEmail()` catches and returns.
 *
 * ── RUNTIME ─────────────────────────────────────────────────────────────
 * nodemailer needs raw TCP and cannot run on the Edge runtime. Resend never
 * exposed this because it is an HTTPS fetch client. Any route that can reach
 * this module must declare `export const runtime = "nodejs"`, and middleware.ts
 * must never import it — even transitively. The dynamic import inside
 * smtpProvider is what keeps it out of the Edge bundle.
 */

import { firmFrom, firmReplyTo } from "@/lib/firmEmail";
import type { FirmKey } from "@/lib/firms";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import { createResendProvider } from "./resendProvider";
import {
  createSmtpProvider,
  missingSmtpVars,
  readSmtpConfig,
  smtpFrom,
} from "./smtpProvider";
import {
  EmailSendError,
  type EmailErrorType,
  type EmailMessage,
  type EmailProvider,
  type ProviderName,
} from "./types";

/**
 * The firm-agnostic sender, for mail that belongs to no file.
 *
 * Read here rather than imported from lib/resend.ts on purpose: that module
 * THROWS at import time when RESEND_API_KEY is unset, and this one must be safe
 * to import from anywhere. Same values, same env vars — keep them in step.
 */
const LEGACY_FROM = () => process.env.EMAIL_FROM?.trim() || "iClosed <hello@iclosed.ca>";
const LEGACY_REPLY_TO = () => process.env.EMAIL_REPLY_TO?.trim() || "hello@iclosed.ca";

/** What every call site gets back. Never throws; always tells you what happened. */
export type EmailSendResult =
  | { ok: true; id?: string; provider: ProviderName }
  | { ok: false; provider: ProviderName | "none"; error: string; errorType: EmailErrorType };

/**
 * A label identifying which send this is, e.g. "welcome", "invite", "milestone".
 *
 * It appears on every log line so routing is provable after the fact, and it is
 * the key the per-send allowlist matches during rollout. Short, stable,
 * kebab-case — these end up in an environment variable.
 */
export type SendLabel = string;

export interface EmailRoute {
  firm: FirmKey | null;
  from: string;
  replyTo: string;
  provider: EmailProvider;
  providerName: ProviderName;
  /** WHY this provider was chosen. Appears on the per-send log line. */
  reason: string;
}

/** Comma-separated env list → trimmed lowercase set. */
function envSet(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Should this (firm, send) pair go over SMTP?
 *
 * Read at CALL TIME, never cached at module scope — a module-level constant
 * would freeze the value for the life of a warm serverless instance, so flipping
 * the variable would not take effect until that instance was recycled. That is
 * exactly the property you do not want in a kill switch.
 *
 * Both allowlists must match. Empty (the shipped default) means everything stays
 * on Resend, which is today's behaviour byte-for-byte.
 */
function smtpGate(
  firm: FirmKey | null,
  label: SendLabel,
): { enabled: boolean; reason: string } {
  if (!firm) return { enabled: false, reason: "firm-agnostic-send" };

  const firmsRaw = process.env.EMAIL_SMTP_FIRMS;
  const firms = envSet(firmsRaw);
  if (!firms.has(firm) && !isWildcard(firms)) {
    return {
      enabled: false,
      reason: `firm-not-allowlisted(EMAIL_SMTP_FIRMS=${describeList(firmsRaw)})`,
    };
  }

  const sendsRaw = process.env.EMAIL_SMTP_SENDS;
  const sends = envSet(sendsRaw);
  if (!isWildcard(sends) && !sends.has(label.toLowerCase())) {
    return {
      enabled: false,
      reason: `send-not-allowlisted(EMAIL_SMTP_SENDS=${describeList(sendsRaw)})`,
    };
  }

  return { enabled: true, reason: "allowlisted" };
}

/**
 * Render an allowlist for a log line.
 *
 * "<unset>" and "<empty>" are DIFFERENT bugs — the first means nobody added the
 * variable to this environment, the second means it is there but blank (a
 * trailing comma, a cleared value). Collapsing them into "falsy" is what makes
 * a misconfigured deployment take an afternoon instead of a minute.
 */
function describeList(raw: string | undefined): string {
  if (raw === undefined) return "<unset>";
  return raw.trim() === "" ? "<empty>" : raw.trim();
}

/**
 * `all` or `*` — every send (or every firm) rather than a hand-kept list.
 *
 * The per-item allowlist exists so a rollout can enable ONE send at a time and
 * watch it. Once a firm is known-good, maintaining that list is just friction:
 * a send added later would silently keep using Resend until someone remembered
 * to add its label, which is its own quiet failure.
 *
 * This only ever widens what an ALREADY-ALLOWLISTED firm sends. It cannot pull
 * in the firm-agnostic senders (the public calculator, the contact form, the
 * internal staff alerts): those pass `firm: null` in code and return false
 * above, so no environment variable can route them over SMTP.
 */
function isWildcard(values: Set<string>): boolean {
  return values.has("all") || values.has("*");
}

/**
 * Resolve where a message is sent from and what carries it.
 *
 * `firm == null` is the firm-agnostic path — the public calculator, the contact
 * form and the internal staff alerts, which firmEmail.ts explicitly reserves
 * EMAIL_FROM for. It always resolves to Resend.
 */
export function resolveEmailRoute(
  firm: FirmKey | null | undefined,
  label: SendLabel,
): EmailRoute {
  const firmKey = firm ?? null;

  const gate = smtpGate(firmKey, label);

  if (firmKey && gate.enabled) {
    const suffix = firmKey.toUpperCase();
    const config = readSmtpConfig(suffix);

    // FAIL CLOSED. Falling through to Resend on a config gap is the single most
    // likely way a silent wrong-provider send actually happens — someone sets
    // the allowlist, forgets the password, and mail keeps flowing through Resend
    // while everyone believes the firm's mandate is being met.
    if (!config) {
      throw new EmailSendError(
        `SMTP is enabled for firm "${firmKey}" but these environment variables ` +
          `are missing or empty: ${missingSmtpVars(suffix).join(", ")}.`,
        "not_configured",
      );
    }

    return {
      firm: firmKey,
      // The SMTP mailbox may differ from the brand address. Where it does, the
      // server will reject the send — or, on Gmail, SILENTLY REWRITE the From to
      // the authenticated account, which looks like success and defeats the
      // whole point. SMTP_FROM_<FIRM> exists so the two can be kept in step.
      from: smtpFrom(suffix) ?? firmFrom(firmKey),
      replyTo: firmReplyTo(firmKey),
      provider: createSmtpProvider(config),
      providerName: "smtp",
      reason: gate.reason,
    };
  }

  return {
    firm: firmKey,
    from: firmKey ? firmFrom(firmKey) : LEGACY_FROM(),
    replyTo: firmKey ? firmReplyTo(firmKey) : LEGACY_REPLY_TO(),
    provider: createResendProvider(process.env.RESEND_API_KEY),
    providerName: "resend",
    reason: gate.reason,
  };
}

export interface SendEmailOptions {
  /** The file's firm. Omit (or null) for the firm-agnostic identity. */
  firm?: FirmKey | null;
  /** Which send this is — used for logging and the per-send rollout allowlist. */
  label: SendLabel;
  /** Override the resolved `from`. */
  from?: string;
  /** Override the resolved `replyTo`; pass `null` to send none at all. */
  replyTo?: string | null;
  /** Retry attempts. Defaults to 3 for Resend, 2 for SMTP. */
  attempts?: number;
}

/** The message as a caller supplies it — identity is resolved for them. */
export type OutgoingEmail = Omit<EmailMessage, "from" | "replyTo">;

/**
 * Send one email.
 *
 * Resolves the firm's identity and transport, retries transient failures, logs a
 * single structured line either way, and returns what happened. Does not throw.
 */
export async function sendEmail(
  message: OutgoingEmail,
  opts: SendEmailOptions,
): Promise<EmailSendResult> {
  // Route resolution can fail closed, and this function's contract is that it
  // NEVER throws — most call sites in this repo have no try/catch at all.
  let route: EmailRoute;
  try {
    route = resolveEmailRoute(opts.firm, opts.label);
  } catch (err) {
    const errorType: EmailErrorType = err instanceof EmailSendError ? err.type : "unknown";
    const errorText = err instanceof Error ? err.message : String(err);
    logger.error(
      `[email] NOT SENT firm=${opts.firm ?? "none"} send=${opts.label} ` +
        `errorType=${errorType}: ${errorText}`,
    );
    // provider "none" is the honest answer: nothing was chosen, so nothing was
    // sent — as opposed to a send that was attempted and refused.
    return { ok: false, provider: "none", error: errorText, errorType };
  }

  const payload: EmailMessage = {
    ...message,
    from: opts.from ?? route.from,
    // `replyTo: null` is meaningfully different from omitting the option.
    ...(opts.replyTo === null ? {} : { replyTo: opts.replyTo ?? route.replyTo }),
  };

  // ONE line per send, written BEFORE the attempt, naming the provider and why
  // it was chosen. A wrong-provider send is otherwise invisible: the only
  // evidence is an absence — no record at the provider you expected to see it
  // at — and an absence is exactly what you cannot search for. `reason` carries
  // the allowlist values as they were actually read in THIS environment, which
  // is what separates "the variable is missing on this deploy" from "the code
  // decided not to use it".
  //
  // Recipients stay out of it (client names and addresses); `from` is ours.
  logger.info(
    `[email] route firm=${route.firm ?? "none"} send=${opts.label} ` +
      `provider=${route.providerName} reason=${route.reason} from=${payload.from}`,
  );

  const started = Date.now();
  const context =
    `firm=${route.firm ?? "none"} provider=${route.providerName} send=${opts.label} ` +
    `to=${payload.to.length}` +
    (payload.cc?.length ? ` cc=${payload.cc.length}` : "") +
    (payload.attachments?.length ? ` attachments=${payload.attachments.length}` : "");

  try {
    const result = await withRetry(() => route.provider.send(payload), {
      // SMTP gets fewer attempts: a worst-case attempt is connectionTimeout +
      // greetingTimeout + socketTimeout ≈ 40s, so three (~121s) would overrun a
      // sane route budget. Resend keeps the usual 3.
      attempts: opts.attempts ?? (route.providerName === "smtp" ? 2 : 3),
      label: `${opts.label}-${route.providerName}`,
      // Never retry a permanent failure — see the note in retry.ts.
      shouldRetry: (err) => !(err instanceof EmailSendError) || err.retryable,
    });

    logger.info(`[email] sent ${context} ms=${Date.now() - started} id=${result.id ?? "-"}`);
    return { ok: true, id: result.id, provider: route.providerName };
  } catch (err) {
    const errorType: EmailErrorType = err instanceof EmailSendError ? err.type : "unknown";
    const errorText = err instanceof Error ? err.message : String(err);

    // Recipients are not logged — they carry client names and addresses. Counts
    // are in `context` above, which is what troubleshooting actually needs.
    logger.error(
      `[email] FAILED ${context} ms=${Date.now() - started} errorType=${errorType}: ${errorText}`,
    );
    return { ok: false, provider: route.providerName, error: errorText, errorType };
  }
}
