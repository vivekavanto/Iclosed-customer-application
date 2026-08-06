"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Info, Loader2, Mail, TriangleAlert, X } from "lucide-react";
import {
  computeStatement,
  ratesFromConfigRow,
  type ClosingCostInputs,
  type ClosingCostRates,
} from "@/lib/closingCosts";
import { formatCurrency, parseAmountInput } from "@/lib/formatCurrency";
import { estimatePdfFileName } from "@/lib/closingEstimateEmail";
import ClosingCostBreakdown from "@/components/dashboard/ClosingCostBreakdown";
import ClosingCostEmailPreview from "@/components/dashboard/ClosingCostEmailPreview";

/* ════════════════════════════════════════════
   CLOSING COST ESTIMATE MODAL

   The client's planning estimate, opened from the dashboard card.

   Everything except the mortgage amount and the first-time-buyer flag is
   prefilled from the client's own file by GET /api/closing-estimate — those two
   are the only figures a buyer actually needs to supply to see a realistic
   number, so they are the only two inputs here. The full fee-by-fee statement
   is one tap away behind "See the full breakdown".

   The maths runs in the browser through src/lib/closingCosts.ts — the twin of
   the admin app's copy — so a figure shown here can never disagree with the one
   staff see. The PDF and email routes independently recompute from the same
   module, so neither trusts these numbers.
════════════════════════════════════════════ */

const BRAND = "#C10007";

interface Prefill {
  purchase_price?: number | null;
  deposit_paid?: number | null;
  mortgage_amount?: number | null;
  is_toronto?: boolean | null;
  is_first_time_buyer?: boolean | null;
  title_premium_override?: number | null;
  property_tax_adjustment?: number | null;
  email?: string | null;
  client_name?: string | null;
  file_no_display?: string | null;
  purchasers?: string | null;
  property_address?: string | null;
  closing_date?: string | null;
  firm_key?: string | null;
  statement_type?: string | null;
}

/** "2026-08-12" → "12 August 2026", built from parts so it can't shift a day. */
function formatLongDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString("en-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "2026-08-12" → "August 12, 2026", for the header strip. */
function formatShortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Group a typed amount as the client types: "399700" → "399,700". */
function formatTypedAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "") return "";
  const [whole, ...rest] = cleaned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // Keep at most one decimal point, and never more than two decimals.
  return rest.length > 0 ? `${grouped}.${rest.join("").slice(0, 2)}` : grouped;
}

/** The first line of the property address — the modal header has one line. */
function shortAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.slice(0, 2).join(", ") || null;
}

const SummaryRow: React.FC<{
  label: string;
  amount: string;
  hint?: React.ReactNode;
}> = ({ label, amount, hint }) => (
  <div className="flex items-start justify-between gap-3 py-2">
    <span className="flex items-center gap-1.5 text-[13px] sm:text-sm text-gray-700">
      {label}
      {hint}
    </span>
    <span className="shrink-0 text-[13px] sm:text-sm tabular-nums text-gray-900">
      {amount}
    </span>
  </div>
);

const ClosingCostEstimateModal: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [prefill, setPrefill] = useState<Prefill>({});
  const [rates, setRates] = useState<ClosingCostRates | null>(null);
  /** Who the email would come from and go to, resolved server-side. */
  const [envelope, setEnvelope] = useState<{ to: string; from: string } | null>(
    null,
  );

  const [mortgage, setMortgage] = useState("");
  const [isFirstTimeBuyer, setIsFirstTimeBuyer] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showTaxHint, setShowTaxHint] = useState(false);
  /** The email preview replaces the estimate body until it is sent or backed out of. */
  const [previewOpen, setPreviewOpen] = useState(false);

  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showNotice = (message: string, type: "success" | "error" = "success") =>
    setNotice({ message, type });

  // ── Esc to close + lock the page behind the modal ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Esc backs out one step at a time: mid-send it does nothing, from the
      // preview it returns to the estimate, and only then does it close.
      if (sending) return;
      if (previewOpen) setPreviewOpen(false);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, previewOpen, sending]);

  // ── Load the client's file ──
  //
  // A promise chain rather than async/await so every setState happens in a
  // callback (react-hooks/set-state-in-effect), matching the dashboard layout.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/closing-estimate")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data?.success) {
          throw new Error(data?.error || "Could not load your estimate");
        }
        const p: Prefill = data.prefill ?? {};
        setPrefill(p);
        setRates(data.rates ?? null);
        setEnvelope(data.email_envelope ?? null);
        const seededMortgage = Number(p.mortgage_amount ?? 0);
        setMortgage(
          Number.isFinite(seededMortgage) && seededMortgage > 0
            ? formatTypedAmount(String(seededMortgage))
            : "",
        );
        setIsFirstTimeBuyer(Boolean(p.is_first_time_buyer));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Could not load your estimate",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setLoading(true);
    setLoadError(null);
    setReloadKey((k) => k + 1);
  };

  // Memoised: ratesFromConfigRow builds a fresh object, which would otherwise
  // be a new identity every render and defeat the statement memo below.
  const effectiveRates = useMemo(
    () => rates ?? ratesFromConfigRow(null),
    [rates],
  );

  /** Blank is "not answered yet" — 0 is a cash deal and a valid answer. */
  const mortgageAmount = parseAmountInput(mortgage);
  const answered = mortgageAmount !== null;

  const price = Number(prefill.purchase_price ?? 0) || 0;

  const inputs: ClosingCostInputs = useMemo(
    () => ({
      price,
      deposit: Number(prefill.deposit_paid ?? 0) || 0,
      mortgage: mortgageAmount ?? 0,
      isToronto: Boolean(prefill.is_toronto),
      isFirstTimeBuyer,
      titlePremiumOverride: prefill.title_premium_override ?? null,
      propertyTaxAdjustment: prefill.property_tax_adjustment ?? null,
    }),
    [price, prefill, mortgageAmount, isFirstTimeBuyer],
  );

  const statement = useMemo(
    () => computeStatement(inputs, effectiveRates),
    [inputs, effectiveRates],
  );

  /** The exact body the PDF and email routes both receive. */
  const requestBody = useMemo(
    () => ({
      firm_key: prefill.firm_key ?? null,
      statement_type: prefill.statement_type ?? null,
      file_no_display: prefill.file_no_display ?? null,
      purchasers: prefill.purchasers ?? prefill.client_name ?? null,
      property_address: prefill.property_address ?? null,
      closing_date: prefill.closing_date ?? null,
      purchase_price: inputs.price,
      deposit_paid: inputs.deposit,
      mortgage_amount: inputs.mortgage,
      is_toronto: inputs.isToronto,
      is_first_time_buyer: inputs.isFirstTimeBuyer,
      title_premium_override: inputs.titlePremiumOverride,
      property_tax_adjustment: inputs.propertyTaxAdjustment,
      adjustments: {},
    }),
    [prefill, inputs],
  );

  // ── Mirror the client's planning figures onto their file ──
  //
  // The back office wants to see what the client is planning around, so a
  // settled set of figures is saved to their deal as an admin-only task.
  // Debounced and deduplicated because it runs while they are still typing, and
  // silent in both directions — the client did not ask for this, so neither
  // success nor failure interrupts them.
  const savedSignature = useRef<string | null>(null);

  useEffect(() => {
    if (loading || loadError) return;
    if (!answered || requestBody.purchase_price <= 0) return;

    const signature = JSON.stringify(requestBody);
    if (signature === savedSignature.current) return;

    const timer = setTimeout(() => {
      // Claimed before the request so a slow round trip can't let the next
      // keystroke queue a duplicate write of the same figures.
      savedSignature.current = signature;
      fetch("/api/closing-estimate/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })
        .then((res) => {
          if (!res.ok) savedSignature.current = null;
        })
        .catch(() => {
          savedSignature.current = null;
        });
    }, 1200);

    return () => clearTimeout(timer);
  }, [loading, loadError, answered, requestBody]);

  const handleDownload = async () => {
    if (price <= 0) {
      showNotice("We don't have a purchase price on your file yet", "error");
      return;
    }
    setDownloading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/closing-estimate/my-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not build your PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Same name the emailed attachment carries, so a client who does both
      // does not end up with two differently-named copies of one document.
      a.download = estimatePdfFileName({
        fileNo: prefill.file_no_display,
        propertyAddress: prefill.property_address,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : "Could not build your PDF",
        "error",
      );
    } finally {
      setDownloading(false);
    }
  };

  /** "Email it to me" only opens the preview — nothing is sent until Send. */
  const handleEmailPreview = () => {
    if (price <= 0) {
      showNotice("We don't have a purchase price on your file yet", "error");
      return;
    }
    setNotice(null);
    setPreviewOpen(true);
  };

  const handleEmail = async () => {
    if (price <= 0) {
      showNotice("We don't have a purchase price on your file yet", "error");
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      // No `to` — the route sends to the address on the client's file.
      const res = await fetch("/api/closing-estimate/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Could not send the email");
      }
      // Back to the estimate — the preview has served its purpose, and leaving
      // it up would invite a second identical send.
      setPreviewOpen(false);
      showNotice(
        data.pdf_attached
          ? `Sent to ${data.sent_to} with the PDF attached`
          : `Sent to ${data.sent_to} — the PDF could not be attached`,
        data.pdf_attached ? "success" : "error",
      );
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : "Could not send the email",
        "error",
      );
    } finally {
      setSending(false);
    }
  };

  const headerBits = [
    shortAddress(prefill.property_address),
    prefill.file_no_display ? `File ${prefill.file_no_display}` : null,
    formatShortDate(prefill.closing_date)
      ? `Closing ${formatShortDate(prefill.closing_date)}`
      : null,
  ].filter(Boolean) as string[];

  const closingLongDate = formatLongDate(prefill.closing_date);
  const propertyTaxAmount = statement.propertyTax?.amount ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Closing cost estimate"
      onClick={sending ? undefined : onClose}
    >
      <div
        className="relative w-full sm:max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto overscroll-contain bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-5 sm:px-7 py-4 sm:py-5 rounded-t-3xl">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-gray-900">
              {previewOpen ? "Review your email" : "Closing cost estimate"}
            </h2>
            {headerBits.length > 0 && (
              <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500">
                {headerBits.join(" · ")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 sm:px-5 py-2 sm:py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <X size={15} strokeWidth={2} className="sm:hidden" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" /> Loading your
            estimate…
          </div>
        ) : loadError ? (
          <div className="mx-auto max-w-md px-6 py-20 text-center">
            <TriangleAlert size={26} className="mx-auto text-gray-300" />
            <p className="mt-3 text-sm text-gray-700">{loadError}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-4 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : previewOpen ? (
          <div className="mx-auto w-full max-w-2xl px-5 sm:px-7 py-5 sm:py-7">
            <ClosingCostEmailPreview
              to={envelope?.to ?? prefill.email ?? ""}
              from={envelope?.from ?? "iClosed"}
              firstName={(prefill.client_name ?? "").trim().split(/\s+/)[0] || null}
              fileNo={prefill.file_no_display}
              propertyAddress={prefill.property_address}
              price={statement.balance.purchasePrice}
              totalClosingCosts={statement.total}
              balanceDue={statement.balance.balanceDue}
              sending={sending}
              onSend={handleEmail}
              onCancel={() => setPreviewOpen(false)}
            />
            {notice && (
              <p
                className={`mt-3 text-center text-xs ${
                  notice.type === "error"
                    ? "text-[#C10007]"
                    : "text-emerald-600"
                }`}
              >
                {notice.message}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-6 md:gap-8 px-5 sm:px-7 py-5 sm:py-7">
            {/* ══ Left: the two questions ══ */}
            <div className="space-y-4">
              {/* Mortgage amount */}
              <div className="rounded-2xl border border-[#F6E3E3] bg-[#FEF9F9] p-4">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-gray-900">
                    Enter your mortgage amount
                  </h3>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#C10007]">
                    Required
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
                  If you&rsquo;re still finalizing your mortgage, enter your best
                  guess. Enter 0 if this is a cash deal.
                </p>
                <div className="relative mt-3">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={mortgage}
                    onChange={(e) =>
                      setMortgage(formatTypedAmount(e.target.value))
                    }
                    placeholder="0"
                    aria-label="Mortgage amount"
                    className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-8 pr-3 text-sm tabular-nums text-gray-900 focus:outline-none focus:border-[#C10007] focus:ring-1 focus:ring-[#C10007]"
                  />
                </div>
              </div>

              {/* First-time buyer */}
              <label className="flex items-start gap-3 rounded-2xl border border-gray-200 p-4 cursor-pointer hover:bg-gray-50/70 transition-colors">
                <input
                  type="checkbox"
                  checked={isFirstTimeBuyer}
                  onChange={(e) => setIsFirstTimeBuyer(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-[#C10007]"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">
                    I&rsquo;m a first-time home buyer
                  </span>
                  <span className="mt-1 block text-xs text-gray-500 leading-relaxed">
                    Applies the land transfer tax rebate &mdash; up to{" "}
                    {formatCurrency(effectiveRates.rebateOntarioMax, {
                      cents: false,
                    })}{" "}
                    in Ontario, plus{" "}
                    {formatCurrency(effectiveRates.rebateTorontoMax, {
                      cents: false,
                    })}{" "}
                    in Toronto.
                  </span>
                </span>
              </label>

              {/* Actions */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={downloading || price <= 0}
                    className="flex items-center gap-1.5 text-sm font-semibold text-[#C10007] hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
                  >
                    {downloading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} strokeWidth={2} />
                    )}
                    Download PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleEmailPreview}
                    disabled={sending || price <= 0}
                    className="flex items-center gap-1.5 text-sm font-semibold text-[#C10007] hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
                  >
                    {sending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Mail size={14} strokeWidth={2} />
                    )}
                    Email it to me
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  We&rsquo;ll send it to the email on your file.
                </p>
                {notice && (
                  <p
                    className={`mt-2 text-xs ${
                      notice.type === "error"
                        ? "text-[#C10007]"
                        : "text-emerald-600"
                    }`}
                  >
                    {notice.message}
                  </p>
                )}
              </div>
            </div>

            {/* ══ Right: the number ══ */}
            <div>
              <p
                className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest"
                style={{ color: BRAND }}
              >
                Funds you&rsquo;ll need on closing
              </p>

              {/* A blank mortgage still computes — the figure then reads as
                  "before any mortgage advance", which the summary row below
                  says explicitly by showing an em dash rather than $0.00. */}
              {price > 0 ? (
                <p
                  className="mt-1.5 text-3xl sm:text-5xl font-bold tabular-nums leading-tight"
                  style={{ color: BRAND }}
                >
                  {formatCurrency(statement.balance.balanceDue)}
                </p>
              ) : (
                <p className="mt-1.5 text-3xl sm:text-5xl font-bold tabular-nums leading-tight text-gray-200">
                  &mdash;
                </p>
              )}

              <p className="mt-1.5 text-xs text-gray-500">
                {price <= 0
                  ? "We don't have a purchase price on your file yet — please contact us."
                  : !answered
                    ? "Enter your mortgage amount to see what you'll actually need."
                    : closingLongDate
                      ? `Certified funds due on or before ${closingLongDate}.`
                      : "Certified funds are due on or before your closing date."}
              </p>

              {/* Summary */}
              <div className="mt-5 divide-y divide-gray-100 border-t border-gray-100">
                <SummaryRow
                  label="Purchase price"
                  amount={formatCurrency(statement.balance.purchasePrice)}
                />
                <SummaryRow
                  label="less deposit already paid"
                  amount={`− ${formatCurrency(statement.balance.depositPaid, {
                    sign: false,
                  })}`}
                />
                <SummaryRow
                  label="less mortgage advance from your lender"
                  amount={
                    answered
                      ? `− ${formatCurrency(statement.balance.mortgageAmount, {
                          sign: false,
                        })}`
                      : "—"
                  }
                />
                {propertyTaxAmount !== 0 && (
                  <SummaryRow
                    label="plus property tax & common expense adjustments (est.)"
                    amount={`${propertyTaxAmount < 0 ? "−" : "+"} ${formatCurrency(
                      propertyTaxAmount,
                      { sign: false },
                    )}`}
                    hint={
                      <button
                        type="button"
                        onClick={() => setShowTaxHint((v) => !v)}
                        aria-label="What is this?"
                        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 cursor-pointer"
                      >
                        <Info size={10} strokeWidth={2.5} />
                      </button>
                    }
                  />
                )}
                <SummaryRow
                  label="plus closing costs"
                  amount={`+ ${formatCurrency(statement.balance.closingCosts, {
                    sign: false,
                  })}`}
                />
              </div>

              {showTaxHint && (
                <p className="mt-2 rounded-lg bg-gray-50 p-3 text-[11px] text-gray-500 leading-relaxed">
                  Your share of property tax and common expenses the seller has
                  already paid past the closing date. The exact figure is
                  confirmed on the Statement of Adjustments from the
                  seller&rsquo;s lawyer.
                </p>
              )}

              {/* Full breakdown */}
              <div className="mt-4 rounded-xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left cursor-pointer"
                >
                  <span className="text-sm font-semibold text-gray-900">
                    {expanded
                      ? "Breakdown of closing costs"
                      : "See the full breakdown"}
                  </span>
                  <span className="shrink-0 text-sm text-gray-500">
                    {expanded ? "Hide" : "Expand"}
                  </span>
                </button>
                {expanded && (
                  <div className="border-t border-gray-100 px-4 py-4">
                    <ClosingCostBreakdown statement={statement} />
                  </div>
                )}
              </div>

              {/* Draft warning */}
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F59E0B] text-[11px] font-bold text-white">
                  !
                </span>
                <p className="text-xs leading-relaxed text-[#92400E]">
                  <span className="font-bold">
                    Draft for planning only &mdash; please don&rsquo;t send funds
                    yet.
                  </span>{" "}
                  We&rsquo;ll confirm your final figures once your lender&rsquo;s
                  mortgage instructions arrive.
                </p>
              </div>

              {/* Disclaimer */}
              <p className="mt-4 text-[11px] leading-relaxed text-gray-400">
                Assumes a standard residential purchase with no more than one
                mortgage, no independent legal advice, no title-related
                rectification, and no gift or trust arrangements; additional fees
                apply where these are needed. An estimate for planning only. The
                property tax and common expense adjustment shown is an estimate
                only; the final Statement of Adjustments items (property tax,
                utility and condominium fee adjustments) are confirmed once we
                receive the Statement of Adjustments from the seller&rsquo;s
                lawyer. The title insurance premium is approximate until First
                Canadian Title issues its quote, and any first-time buyer rebate
                depends on confirming your eligibility. E. &amp; O.E.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClosingCostEstimateModal;
