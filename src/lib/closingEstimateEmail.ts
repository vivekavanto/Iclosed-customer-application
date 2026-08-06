// The "email me my estimate" message — subject, body and attachment name.
//
// ⚠️ SINGLE SOURCE OF TRUTH. The client previews this message before sending
// (ClosingCostEmailPreview.tsx) and the route sends it (api/closing-estimate/
// email). Both read from here, so what the client approves is what leaves the
// building. Change the wording once and both move together.
//
// PURE by design: no Resend client, no Supabase, no React. That is what lets
// the preview import it in the browser without dragging the mail transport —
// and src/lib/resend.ts throws on import when RESEND_API_KEY is unset, which
// must never take out a read-only screen.

/**
 * Mirrors EMAIL_FROM in src/lib/resend.ts.
 *
 * Deliberately duplicated rather than imported: resend.ts constructs the Resend
 * client at module scope and throws without an API key, so importing it here
 * would make the preview endpoint fail closed for a cosmetic "From" line.
 * Both read the same env var, so they cannot disagree in a real deployment.
 */
export const EMAIL_FROM_LABEL =
  process.env.EMAIL_FROM || "iClosed <noreply@iclosed.ca>";

/** Shown under the figures, in the email and in the preview. */
export const DRAFT_NOTICE_LEAD =
  "Draft for planning only — please don't send any funds yet.";
export const DRAFT_NOTICE_REST =
  "Final figures are confirmed once we receive your lender's mortgage instructions.";

/** Sign-off line. Matches the contact details on the dashboard. */
export const EMAIL_FOOTER = "Nava Wilson Professional Corporation · 416-321-1100";

export interface EstimateEmailContent {
  /** Client's first name, or null for the impersonal fallback. */
  firstName?: string | null;
  propertyAddress?: string | null;
  fileNo?: string | null;
  price: number;
  totalClosingCosts: number;
  balanceDue: number;
  /** False when the PDF could not be generated — the body then omits it. */
  hasAttachment: boolean;
}

/** "$21,363.69" */
export function money(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(n)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${abs}`;
}

/** Minimal HTML escape — every interpolated value below is user-supplied. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "Your closing cost estimate — 26P-867" */
export function estimateEmailSubject(fileNo?: string | null): string {
  const suffix = (fileNo ?? "").trim();
  return suffix
    ? `Your closing cost estimate — ${suffix}`
    : "Your closing cost estimate";
}

/**
 * "iClosed Closing Cost Estimate 26P-867 789 Salem Road North, Ajax, Ontario.pdf"
 *
 * A name the client can find again in their downloads folder months later,
 * rather than a slug. Characters that are illegal in a Windows/macOS filename
 * are stripped; commas and spaces are fine and are kept.
 */
export function estimatePdfFileName(opts: {
  fileNo?: string | null;
  propertyAddress?: string | null;
}): string {
  const clean = (v: string | null | undefined) =>
    String(v ?? "")
      .replace(/[\\/:*?"<>|\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const parts = ["iClosed Closing Cost Estimate", clean(opts.fileNo), clean(opts.propertyAddress)]
    .filter(Boolean)
    .join(" ");

  // Keep well inside the 255-byte limit once the extension is added.
  return `${parts.slice(0, 180).trim()}.pdf`;
}

/** The greeting line: "Hi Aliya," or "Hi there," when we have no name. */
export function estimateEmailGreeting(firstName?: string | null): string {
  const name = (firstName ?? "").trim();
  return name ? `Hi ${name},` : "Hi there,";
}

/**
 * The opening sentence. Names the property when we have one, so the client can
 * tell at a glance which file this is about.
 */
export function estimateEmailIntroParts(content: EstimateEmailContent): {
  before: string;
  address: string | null;
  after: string;
} {
  const address = (content.propertyAddress ?? "").trim() || null;
  return {
    before: "Here is your draft closing cost estimate",
    address: address ? ` for ${address}` : null,
    after: content.hasAttachment
      ? ". The full statement is attached as a PDF."
      : ".",
  };
}

/** The three figures the email summarises. The PDF carries the full breakdown. */
export function estimateEmailRows(
  content: EstimateEmailContent,
): Array<{ label: string; amount: number; emphasis?: boolean }> {
  return [
    { label: "Purchase price", amount: content.price },
    { label: "Total closing costs", amount: content.totalClosingCosts },
    {
      label: "Funds you'll need on closing",
      amount: content.balanceDue,
      emphasis: true,
    },
  ];
}

/** The email body, as HTML. */
export function estimateEmailHtml(content: EstimateEmailContent): string {
  const intro = estimateEmailIntroParts(content);
  const introHtml = `${esc(intro.before)}${
    intro.address ? `<strong>${esc(intro.address)}</strong>` : ""
  }${esc(intro.after)}`;

  const rowsHtml = estimateEmailRows(content)
    .map(
      (r) => `
      <tr>
        <td style="padding:12px 12px 12px 0;font-size:${r.emphasis ? "15px" : "14px"};${
          r.emphasis ? "font-weight:bold;color:#1e293b;" : "color:#475569;"
        }${r.emphasis ? "" : "border-bottom:1px solid #e2e8f0;"}">${esc(r.label)}</td>
        <td style="padding:12px 0;text-align:right;white-space:nowrap;font-size:${
          r.emphasis ? "15px" : "14px"
        };font-weight:bold;color:${r.emphasis ? "#C10007" : "#1e293b"};${
          r.emphasis ? "" : "border-bottom:1px solid #e2e8f0;"
        }">${esc(money(r.amount))}</td>
      </tr>`,
    )
    .join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:560px;margin:0 auto;">
      <p style="font-size:15px;">${esc(estimateEmailGreeting(content.firstName))}</p>
      <p style="font-size:15px;line-height:1.6;">${introHtml}</p>

      <table style="width:100%;margin:20px 0;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;">
        ${rowsHtml}
      </table>

      <div style="margin:24px 0;border:1px solid #FDE68A;background:#FFFBEB;border-radius:10px;padding:16px 18px;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#92400E;">
          <strong>${esc(DRAFT_NOTICE_LEAD)}</strong> ${esc(DRAFT_NOTICE_REST)}
        </p>
      </div>

      <p style="font-size:12px;line-height:1.6;color:#64748b;">${esc(EMAIL_FOOTER)}</p>
    </div>
  `;
}
