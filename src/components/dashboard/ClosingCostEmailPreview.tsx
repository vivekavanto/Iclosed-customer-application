"use client";

import React from "react";
import { FileText, Loader2, Send } from "lucide-react";
import {
  DRAFT_NOTICE_LEAD,
  DRAFT_NOTICE_REST,
  emailFooter,
  estimateEmailGreeting,
  estimateEmailIntroParts,
  estimateEmailRows,
  estimateEmailSubject,
  estimatePdfFileName,
  money,
} from "@/lib/closingEstimateEmail";
import { resolveFirmKey } from "@/lib/firms";

/* ════════════════════════════════════════════
   CLOSING COST EMAIL PREVIEW

   What the client sees BEFORE anything is sent. Nothing here talks to the
   network — pressing Send is what calls the route.

   The subject, greeting, body, figures, footer and attachment name all come
   from src/lib/closingEstimateEmail.ts, the same module the route builds the
   outgoing HTML from. That is deliberate: a preview that renders its own
   wording is a preview that quietly stops being true.
════════════════════════════════════════════ */



const ClosingCostEmailPreview: React.FC<{
  to: string;
  from: string;
  firstName?: string | null;
  fileNo?: string | null;
  propertyAddress?: string | null;
  /** Sale previews summarise proceeds. */
  kind?: "purchase" | "sale";
  price: number;
  totalClosingCosts: number;
  balanceDue: number | null;
  /** The firm's brand colour, from Settings → Closing costs. */
  brand: string;
  /** The file's firm — decides the sign-off, exactly as the sent email will. */
  firmKey?: string | null;
  sending: boolean;
  onSend: () => void;
  onCancel: () => void;
}> = ({
  to,
  from,
  firstName,
  fileNo,
  propertyAddress,
  kind,
  price,
  totalClosingCosts,
  balanceDue,
  brand,
  firmKey,
  sending,
  onSend,
  onCancel,
}) => {
  // The PDF is generated server-side and only ever fails as an exception, so
  // the preview states the normal case: attached.
  const content = {
    firstName,
    propertyAddress,
    fileNo,
    kind,
    price,
    totalClosingCosts,
    balanceDue,
    hasAttachment: true,
  };

  const intro = estimateEmailIntroParts(content);
  const rows = estimateEmailRows(content);
  const attachmentName = estimatePdfFileName({ fileNo, propertyAddress });

  return (
    <div>
      {/* ── The message ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200">
        {/* Brand bar */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <span className="flex items-center select-none">
            <span
              className="text-xl font-bold italic leading-none"
              style={{
                color: brand,
                fontFamily: "Georgia, 'Times New Roman', serif",
              }}
            >
              i
            </span>
            <span className="text-xl font-bold leading-none tracking-tight text-gray-900">
              Closed
            </span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Email preview
          </span>
        </div>

        {/* Envelope */}
        <dl className="border-b border-gray-100 px-5 py-4 text-sm">
          {[
            { label: "To", value: to || "the email on your file" },
            { label: "From", value: from },
            { label: "Subject", value: estimateEmailSubject(fileNo) },
          ].map((row) => (
            <div key={row.label} className="flex gap-3 py-1">
              <dt className="w-16 shrink-0 text-gray-400">{row.label}</dt>
              <dd className="min-w-0 break-words font-semibold text-gray-900">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* Body */}
        <div className="px-5 py-5">
          <p className="text-sm text-gray-700">
            {estimateEmailGreeting(firstName)}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-gray-700">
            {intro.before}
            {intro.address && (
              <span className="font-bold text-gray-900">{intro.address}</span>
            )}
            {intro.after}
          </p>

          {/* Figures */}
          <div className="mt-5 rounded-xl border border-gray-200 px-4">
            {rows.map((row, i) => (
              <div
                key={row.label}
                className={`flex items-center justify-between gap-3 py-3 ${
                  i < rows.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                <span
                  className={
                    row.emphasis
                      ? "text-sm font-bold text-gray-900"
                      : "text-sm text-gray-600"
                  }
                >
                  {row.label}
                </span>
                <span
                  className="shrink-0 text-sm font-bold tabular-nums"
                  style={{ color: row.emphasis ? brand : "#1e293b" }}
                >
                  {row.amount === null ? "[Amount]" : money(row.amount)}
                </span>
              </div>
            ))}
          </div>

          {/* Draft notice */}
          <div className="mt-5 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
            <p className="text-xs leading-relaxed text-[#92400E]">
              <span className="font-bold">{DRAFT_NOTICE_LEAD}</span>{" "}
              {DRAFT_NOTICE_REST}
            </p>
          </div>

          {/* Attachment */}
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-gray-200 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FEF2F2]">
              <FileText size={14} style={{ color: brand }} strokeWidth={2} />
            </span>
            <span className="min-w-0 truncate text-sm text-gray-700">
              {attachmentName}
            </span>
          </div>

          <p className="mt-5 text-xs text-gray-400">{emailFooter(resolveFirmKey(firmKey))}</p>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="mt-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={sending}
          className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Back to my estimate
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={sending}
          className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white hover:bg-[#a30006] disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
          style={{ backgroundColor: brand }}
        >
          {sending ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Sending…
            </>
          ) : (
            <>
              <Send size={15} strokeWidth={2} /> Send email
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ClosingCostEmailPreview;
