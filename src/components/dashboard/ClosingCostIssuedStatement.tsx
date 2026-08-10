"use client";

import React, { useMemo, useState } from "react";
import { Download, FileCheck2, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { snapshotToStatement } from "@/lib/closingEstimateSnapshot";
import ClosingCostBreakdown from "@/components/dashboard/ClosingCostBreakdown";

/* ════════════════════════════════════════════
   ISSUED STATEMENT

   The statement the FIRM prepared and issued — the client's copy of the
   document their lawyer stands behind.

   Every figure here is rehydrated from the estimate's FROZEN `line_items`
   snapshot, never recomputed. That is the whole point: what the client was sent
   must keep saying what it said, even after the firm's standard fees move.
   Nothing on this panel is editable, and nothing the client types below it can
   change it.

   The download is a straight proxy of the stored PDF (GET
   /api/closing-estimate/pdf), so the client receives the byte-identical file
   the firm produced rather than a fresh render of it.
════════════════════════════════════════════ */



export interface IssuedEstimate {
  id: string;
  line_items: unknown;
  total_closing_costs: number | string | null;
  balance_due: number | string | null;
  issued_at: string | null;
  has_pdf: boolean;
  /** The firm's name as frozen onto the estimate, not as it stands today. */
  firm_label?: string | null;
}

/** A timestamp from the database → "5 August 2026", in the reader's timezone. */
function formatIssuedOn(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const ClosingCostIssuedStatement: React.FC<{
  issued: IssuedEstimate;
  /** The file's firm today — only a fallback for an estimate with no snapshot. */
  firmLabel: string | null;
  /** The firm's brand colour, from Settings → Closing costs. */
  brand: string;
  /**
   * Which of the client's files this statement belongs to.
   *
   * Passed to the download so it streams THIS file's stored PDF. Without it a
   * client with two files could be shown one statement and handed the other.
   */
  fileId: string | null;
  onError: (message: string) => void;
}> = ({ issued, firmLabel: liveFirmLabel, brand, fileId, onError }) => {
  // The frozen name wins: this panel titles a document, and the document says
  // who prepared it.
  const firmLabel = issued.firm_label ?? liveFirmLabel;
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const statement = useMemo(
    () => snapshotToStatement(issued.line_items),
    [issued.line_items],
  );

  const issuedOn = formatIssuedOn(issued.issued_at);

  // Prefer the row's own totals: they are what the firm recorded, and a
  // snapshot too old to rehydrate must not take the headline figure with it.
  const balanceDue = Number(issued.balance_due ?? 0);
  const totalClosingCosts = Number(issued.total_closing_costs ?? 0);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(
        fileId
          ? `/api/closing-estimate/pdf?file_id=${encodeURIComponent(fileId)}`
          : "/api/closing-estimate/pdf",
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not open your statement");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // The route names the file in its Content-Disposition; this only has to
      // be a sane fallback for browsers that ignore it on a blob: URL.
      a.download = "closing-statement.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      onError(
        err instanceof Error ? err.message : "Could not open your statement",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#F6E3E3] bg-[#FEF9F9] p-4 sm:p-5">
      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white"
          style={{ color: brand }}
        >
          <FileCheck2 size={16} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900">
            {firmLabel
              ? `Your statement from ${firmLabel}`
              : "Your statement from us"}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {issuedOn
              ? `Prepared for you on ${issuedOn}. These are our figures — the estimate below is your own.`
              : "These are our figures — the estimate below is your own."}
          </p>
        </div>
      </div>

      {/* ── The two figures that matter ── */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl bg-white px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Funds due on closing
          </p>
          <p
            className="mt-1 text-xl sm:text-2xl font-bold tabular-nums"
            style={{ color: brand }}
          >
            {formatCurrency(balanceDue)}
          </p>
        </div>
        <div className="rounded-xl bg-white px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Total closing costs
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-gray-900">
            {formatCurrency(totalClosingCosts)}
          </p>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-6 gap-y-2">
        {issued.has_pdf ? (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 text-sm font-semibold hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
            style={{ color: brand }}
          >
            {downloading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} strokeWidth={2} />
            )}
            Download statement
          </button>
        ) : (
          // The admin app issues the estimate first and uploads the PDF second,
          // so the document can legitimately lag the figures by a moment. Saying
          // so is better than offering a button that 404s.
          <span className="text-sm text-gray-400">
            Your PDF is being prepared — please check back shortly.
          </span>
        )}

        {statement && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="text-sm font-semibold text-gray-600 hover:underline cursor-pointer"
          >
            {expanded ? "Hide breakdown" : "See our breakdown"}
          </button>
        )}
      </div>

      {expanded && statement && (
        <div className="mt-3.5 rounded-xl bg-white px-4 py-4">
          <ClosingCostBreakdown statement={statement} brand={brand} />
        </div>
      )}
    </div>
  );
};

export default ClosingCostIssuedStatement;
