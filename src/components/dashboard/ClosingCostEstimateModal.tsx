"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Mail, TriangleAlert, X } from "lucide-react";
import { parseAmountInput } from "@/lib/formatCurrency";
import DraftStatementSections from "@/components/dashboard/DraftStatementSections";
import { buildPurchaseDraft, draftStatementPdfFileName, type DraftFileInput } from "@/lib/draftStatement";
import type { IclosedFees } from "@/lib/iclosedFees";
import ClosingCostEmailPreview from "@/components/dashboard/ClosingCostEmailPreview";
import ClosingCostIssuedStatement, {
  type IssuedEstimate,
} from "@/components/dashboard/ClosingCostIssuedStatement";

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

   Those two answers are also the ONLY thing sent back. Everything else is the
   file's, resolved server-side by src/lib/clientEstimateContext.ts, and a body
   that carries one of those fields is refused — so the read-only figures on
   this screen are read-only in fact, not only in the markup.
════════════════════════════════════════════ */

/**
 * Only until GET /api/closing-estimate answers with the file's firm.
 *
 * Every colour on this screen is the firm's `brand_color` from Settings →
 * Closing costs; this exists so the first paint before that arrives is not
 * black, and is never what a loaded modal renders.
 */
const BRAND_FALLBACK = "#C10007";

/** One of the client's files, for the picker. */
interface FileOption {
  id: string;
  file_number: string | null;
  property_address: string | null;
  closing_date: string | null;
  has_issued_estimate: boolean;
}

interface Prefill {
  purchase_price?: number | null;
  deposit_paid?: number | null;
  mortgage_amount?: number | null;
  is_toronto?: boolean | null;
  is_first_time_buyer?: boolean | null;
  title_premium_override?: number | null;
  property_tax_adjustment?: number | null;
  /** The firm's "Is estimate" answers. null = never said → line default. */
  title_premium_is_estimate?: boolean | null;
  teraview_is_estimate?: boolean | null;
  sheriff_is_estimate?: boolean | null;
  property_tax_is_estimate?: boolean | null;
  email?: string | null;
  client_name?: string | null;
  file_no_display?: string | null;
  purchasers?: string | null;
  property_address?: string | null;
  closing_date?: string | null;
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

const ClosingCostEstimateModal: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [prefill, setPrefill] = useState<Prefill>({});
  /**
   * Every file this client owns, and which one they are looking at.
   *
   * `requestedFileId` is what the PICKER sets and what the fetch asks for;
   * `activeFileId` is what the server actually resolved. They are separate so
   * the effect can depend on the request without re-firing on its own answer,
   * and so the picker still shows the right file on first load, when the client
   * has asked for nothing and the server chose the default.
   */
  const [files, setFiles] = useState<FileOption[]>([]);
  const [requestedFileId, setRequestedFileId] = useState<string | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  /** The statement the firm has issued on this file, if any. Read-only. */
  const [issued, setIssued] = useState<IssuedEstimate | null>(null);
  /** The file's firm — fixed server-side; there is no picker. */
  const [firmLabel, setFirmLabel] = useState<string | null>(null);
  /** The firm's key, for the wording that differs between the two entities. */
  const [firmKey, setFirmKey] = useState<string | null>(null);
  /** The firm's brand colour from Settings — never a literal on this screen. */
  const [brand, setBrand] = useState<string>(BRAND_FALLBACK);
  /** Who the email would come from and go to, resolved server-side. */
  const [envelope, setEnvelope] = useState<{ to: string; from: string } | null>(
    null,
  );

  // Figures follow the box as the client types; the save below is debounced.
  const [mortgage, setMortgage] = useState("");
  const [isFirstTimeBuyer, setIsFirstTimeBuyer] = useState(false);
  // v6 draft statement inputs from GET /api/closing-estimate.
  const [iclosedFees, setIclosedFees] = useState<IclosedFees | null>(null);
  const [draftInput, setDraftInput] = useState<DraftFileInput | null>(null);
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

    fetch(
      requestedFileId
        ? `/api/closing-estimate?file_id=${encodeURIComponent(requestedFileId)}`
        : "/api/closing-estimate",
    )
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data?.success) {
          throw new Error(data?.error || "Could not load your estimate");
        }
        const p: Prefill = data.prefill ?? {};
        setPrefill(p);
        setIclosedFees((data.iclosed_fees as IclosedFees | undefined) ?? null);
        setDraftInput((data.draft_input as DraftFileInput | undefined) ?? null);
        setEnvelope(data.email_envelope ?? null);
        setFiles((data.files as FileOption[] | undefined) ?? []);
        // What the SERVER resolved — which on first load is its default choice,
        // not something the client asked for.
        setActiveFileId((data.deal?.id as string | null) ?? null);
        setIssued((data.issued as IssuedEstimate | null) ?? null);
        setFirmLabel((data.firm?.label as string | null) ?? null);
        setFirmKey((data.firm?.firm_key as string | null) ?? null);
        // Branding comes from Settings → Closing costs. The
        // fallbacks only cover a config the migrations have not reached yet.
        setBrand((data.firm?.brand_color as string | null) || BRAND_FALLBACK);
        const seededMortgage = Number(p.mortgage_amount ?? 0);
        // Reopen on the mortgage the client gave before.
        const seededInput =
          Number.isFinite(seededMortgage) && seededMortgage > 0
            ? formatTypedAmount(String(seededMortgage))
            : "";
        setMortgage(seededInput);
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
  }, [reloadKey, requestedFileId]);

  const retry = () => {
    setLoading(true);
    setLoadError(null);
    setReloadKey((k) => k + 1);
  };

  /** Switch files. Everything on screen is re-fetched for the new one. */
  const selectFile = (id: string) => {
    if (id === activeFileId) return;
    setLoading(true);
    setLoadError(null);
    setNotice(null);
    // The email preview would keep showing the previous file's document.
    setPreviewOpen(false);
    setRequestedFileId(id);
  };

  /** Live from the box; blank counts as $0, a typed 0 is a cash deal. */
  const mortgageAmount = parseAmountInput(mortgage);
  const answered = mortgageAmount !== null;

  const price = Number(prefill.purchase_price ?? 0) || 0;

  const draft = useMemo(
    () =>
      iclosedFees && draftInput
        ? buildPurchaseDraft(iclosedFees, {
            ...draftInput,
            mortgage: mortgageAmount,
            firstTimeBuyer: isFirstTimeBuyer,
          })
        : null,
    [iclosedFees, draftInput, mortgageAmount, isFirstTimeBuyer],
  );

  /**
   * The exact body the save, PDF and email routes all receive.
   *
   * Two fields, because two fields are all a client gets to decide. Sending any
   * of the file's own figures back would be rejected outright — see
   * LOCKED_INPUT_KEYS in src/lib/clientEstimateContext.ts.
   */
  const requestBody = useMemo(
    () => ({
      // Not an input — it names which of the client's own files this is about,
      // and the server checks it against their session before reading anything.
      file_id: activeFileId,
      mortgage_amount: mortgageAmount ?? 0,
      is_first_time_buyer: isFirstTimeBuyer,
    }),
    [activeFileId, mortgageAmount, isFirstTimeBuyer],
  );

  // ── Mirror the client's planning figures onto their file ──
  //
  // The back office wants to see what the client is planning around, so a
  // settled set of figures is saved to their deal as an admin-only task.
  // Debounced and deduplicated because the checkbox and the file switcher can
  // still move it several times in a row, and silent in both directions — the
  // client did not ask for this, so neither success nor failure interrupts them.
  const savedSignature = useRef<string | null>(null);

  useEffect(() => {
    if (loading || loadError) return;
    if (!answered || price <= 0) return;

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
  }, [loading, loadError, answered, price, requestBody]);

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
      a.download = draftStatementPdfFileName(prefill.file_no_display, prefill.property_address);
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Closing cost estimate"
      onClick={sending ? undefined : onClose}
    >
      <div
        className="relative w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto overscroll-contain bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-5 sm:px-7 py-4 sm:py-5 rounded-t-3xl">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-gray-900">
              {previewOpen ? "Review your email" : "Estimate your closing costs"}
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-gray-500">
              Based on your quote and mortgage amount
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X size={20} strokeWidth={2} />
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
              price={price}
              totalClosingCosts={draft?.closingCostsTotal ?? 0}
              balanceDue={draft?.fundsRequired ?? null}
              brand={brand}
              firmKey={firmKey}
              sending={sending}
              onSend={handleEmail}
              onCancel={() => setPreviewOpen(false)}
            />
            {notice && (
              <p
                className={`mt-3 text-center text-xs ${
                  notice.type === "error" ? "" : "text-emerald-600"
                }`}
                style={notice.type === "error" ? { color: brand } : undefined}
              >
                {notice.message}
              </p>
            )}
          </div>
        ) : (
          <>
            {/* ══ Which file ══
                Only when there is a choice to make. A buyer with a purchase and
                a sale on the go needs to say which one they are planning
                around; a buyer with one file should not be asked. */}
            {files.length > 1 && (
              <div className="px-5 sm:px-7 pt-5 sm:pt-7">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Which file?
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {files.map((file) => {
                    const active = file.id === activeFileId;
                    return (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => selectFile(file.id)}
                        aria-pressed={active}
                        className={`rounded-lg border px-3 py-2 text-left text-[12.5px] font-semibold transition cursor-pointer ${
                          active
                            ? ""
                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                        style={
                          active
                            ? { borderColor: brand, color: brand }
                            : undefined
                        }
                      >
                        {shortAddress(file.property_address) ??
                          file.file_number ??
                          "Your file"}
                        <span className="ml-1.5 font-normal text-gray-400">
                          {file.has_issued_estimate
                            ? "· statement ready"
                            : file.file_number
                              ? `· ${file.file_number}`
                              : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══ The firm's issued statement ══
                Shown first and kept visually separate, because it is a document
                the firm stands behind and the calculator below it is not. Its
                figures come from the frozen snapshot, so nothing on this screen
                can move them. */}
            {issued && (
              <div className="px-5 sm:px-7 pt-5 sm:pt-7">
                <ClosingCostIssuedStatement
                  issued={issued}
                  firmLabel={firmLabel}
                  brand={brand}
                  fileId={activeFileId}
                  onError={(message) => showNotice(message, "error")}
                />
                <h3 className="mt-6 text-sm font-bold text-gray-900">
                  Try your own numbers
                </h3>
              </div>
            )}

          <div className="space-y-4 px-5 sm:px-7 py-5 sm:py-7">
            {/* Draft warning */}
            <div className="flex items-start gap-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3.5">
              <TriangleAlert size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-[#D97706]" />
              <p className="text-sm leading-relaxed text-[#92400E]">
                <span className="font-bold">Draft estimate only.</span> These are not your final
                figures. Your final amounts depend on your mortgage instructions and the final
                statement of adjustments, and will be confirmed before closing.
              </p>
            </div>

            {/* Mortgage amount */}
            <div>
              <label htmlFor="estimate-mortgage" className="block text-sm font-semibold text-gray-900">
                Mortgage amount ($)
              </label>
              <input
                id="estimate-mortgage"
                type="text"
                inputMode="decimal"
                value={mortgage}
                onChange={(e) => setMortgage(formatTypedAmount(e.target.value))}
                placeholder="Enter 0 for a cash purchase"
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm tabular-nums text-gray-900 outline-none transition"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = brand;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "";
                }}
              />
            </div>

            {/* First-time buyer */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isFirstTimeBuyer}
                onChange={(e) => setIsFirstTimeBuyer(e.target.checked)}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300"
                style={{ accentColor: brand }}
              />
              <span className="text-sm text-gray-700">
                I&rsquo;m a first-time home buyer (land transfer tax rebates)
              </span>
            </label>

            {price <= 0 ? (
              <p className="text-sm text-gray-500">
                We don&rsquo;t have a purchase price on your file yet &mdash; please contact us.
              </p>
            ) : (
              draft && (
                <DraftStatementSections
                  sections={draft.sections}
                  brand={brand}
                  highlight="Funds you need on closing"
                />
              )
            )}

            <p className="text-xs leading-relaxed text-gray-400">
              This is a draft estimate only (E. &amp; O.E.). Your final figures depend on your
              mortgage instructions and the final statement of adjustments, and will be confirmed
              before closing.
            </p>

            {/* Actions */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading || price <= 0}
                  className="flex items-center gap-1.5 text-sm font-semibold hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
                  style={{ color: brand }}
                >
                  {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} strokeWidth={2} />}
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={handleEmailPreview}
                  disabled={sending || price <= 0}
                  className="flex items-center gap-1.5 text-sm font-semibold hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
                  style={{ color: brand }}
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} strokeWidth={2} />}
                  Email it to me
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">We&rsquo;ll send it to the email on your file.</p>
              {notice && (
                <p
                  className={`mt-2 text-xs ${notice.type === "error" ? "" : "text-emerald-600"}`}
                  style={notice.type === "error" ? { color: brand } : undefined}
                >
                  {notice.message}
                </p>
              )}
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ClosingCostEstimateModal;
