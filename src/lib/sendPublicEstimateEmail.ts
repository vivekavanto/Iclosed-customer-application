// Emails an anonymous visitor the estimate they just built on
// /closing-cost-calculator, with the statement PDF attached.
//
// ── Why this is not closingEstimateEmail.ts ────────────────────────────────
// That module is the SIGNED-IN client's message: it names their property, their
// file number, and is previewed on screen before they approve it. A public
// visitor has none of those — no file, no address, no session — so the body here
// is the two figures that matter plus the firm's own disclaimer wording, and
// nothing else. The one free-text value is a first name, already restricted to
// name-shaped characters by `parsePublicEstimatePayload` before it reaches here.
//
// The summary in the body is deliberately short — the balance due plus the
// headline total. The full breakdown is the attached PDF, which is the
// authoritative document and the one the firm stands behind.

import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "./resend";
import { esc, money } from "./closingEstimateEmail";
import type { Statement } from "./closingCosts";
import type { StatementTypeConfig } from "./closingCostSettings";

export interface PublicEstimateEmailParams {
  to: string;
  statement: Statement;
  statementType: StatementTypeConfig;
  /** The merged firm config — supplies the sender's name in the sign-off. */
  config: Record<string, unknown>;
  clientName?: string | null;
  /** The statement PDF. Omitted only if generation failed. */
  pdf?: { fileName: string; bytes: Uint8Array } | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailAddress(value: unknown): boolean {
  return typeof value === "string" && EMAIL_RE.test(value.trim());
}

export async function sendPublicEstimateEmail(
  params: PublicEstimateEmailParams,
): Promise<{ success: boolean; error?: string }> {
  const to = (params.to ?? "").trim();
  if (!isEmailAddress(to)) {
    return { success: false, error: "Enter a valid email address." };
  }

  const { statement, statementType, config, pdf } = params;
  const firmName = String(config.firm_name ?? "").trim() || "iClosed";
  const firstName = (params.clientName ?? "").trim().split(/\s+/)[0] || "there";

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1e293b; max-width: 560px; margin: 0 auto;">
      <p style="font-size: 15px;">Hi ${esc(firstName)},</p>
      <p style="font-size: 15px; line-height: 1.6;">
        Here is your ${esc(statementType.label.toLowerCase())} of the costs to close your purchase.
        ${pdf ? "The full breakdown is attached as a PDF." : ""}
      </p>

      <div style="margin: 24px 0; border: 1px solid #FECACA; background: #FEF2F2; border-radius: 10px; padding: 18px 20px;">
        <p style="margin: 0 0 6px; font-size: 12px; font-weight: bold; letter-spacing: 0.5px; color: #C10007;">
          FUNDS YOU&rsquo;LL NEED ON CLOSING
        </p>
        <p style="margin: 0; font-size: 26px; font-weight: bold; color: #C10007;">
          ${esc(money(statement.balance.balanceDue))}
        </p>
        <p style="margin: 10px 0 0; font-size: 13px; color: #475569;">
          Total closing costs (fees, taxes &amp; disbursements): <strong>${esc(money(statement.total))}</strong>
        </p>
      </div>

      <p style="font-size: 13px; line-height: 1.6; color: #475569;">
        ${esc(statementType.disclaimer_intro)}
      </p>
      ${
        statementType.footer_note
          ? `<p style="font-size: 12px; line-height: 1.6; color: #64748b;">${esc(statementType.footer_note)}</p>`
          : ""
      }

      <p style="font-size: 14px; color: #475569;">&mdash; ${esc(firmName)}</p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: [to],
      subject: `${statementType.label} — your closing costs`,
      html,
      attachments: pdf
        ? [{ filename: pdf.fileName, content: Buffer.from(pdf.bytes) }]
        : undefined,
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Could not send the email",
    };
  }
}
