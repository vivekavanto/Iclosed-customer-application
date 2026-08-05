"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  Info,
  Loader2,
  Mail,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import {
  DISCLAIMERS,
  computeStatement,
  ratesFromConfigRow,
  type ClosingCostInputs,
  type ClosingCostRates,
} from "@/lib/closingCosts";
import type { StatementTypeConfig } from "@/lib/closingCostSettings";
import { snapshotToStatement } from "@/lib/closingEstimateSnapshot";
import { formatCurrency, parseAmountInput } from "@/lib/formatCurrency";
import ClosingCostStatement from "@/components/shared/ClosingCostStatement";

// The client's closing-cost page.
//
// Two things live here, and keeping them visually distinct is the whole point:
//
//   1. THE FIRM'S STATEMENT — the figures actually issued, rehydrated from the
//      frozen snapshot. Authoritative, and downloadable as the PDF the firm
//      itself generated.
//   2. THE CLIENT'S OWN ESTIMATE — everything on the left panel. Never saved
//      anywhere, and its PDF always carries the DRAFT watermark so a planning
//      copy can't be mistaken for a statement of account.
//
// The maths comes from src/lib/closingCosts.ts, the twin of the admin app's
// copy, so a figure a client sees here can never disagree with the one staff
// see there.

const BRAND = "#C10007";

const inputClass =
  "w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#C10007] focus:ring-1 focus:ring-[#C10007] bg-white";

const feeInputClass =
  "w-full pl-6 pr-2 py-2 text-[13px] border border-gray-200 rounded-md focus:outline-none focus:border-[#C10007] focus:ring-1 focus:ring-[#C10007] bg-white tabular-nums";

/**
 * The fees a client may adjust, in the order the design lays them out.
 *
 * Land transfer tax and the rebates are deliberately absent: they are statutory
 * and not something anyone gets to change.
 */
const ADJUST_FIELDS: Array<{ key: string; label: string }> = [
  { key: "legal_transfer", label: "Legal fee — transfer" },
  { key: "legal_mortgage", label: "Legal fee — mortgage" },
  { key: "legal_title_submission", label: "Title submission & review" },
  { key: "admin_fee", label: "Admin fee" },
  { key: "reg_transfer", label: "Registration of Transfer" },
  { key: "reg_mortgage", label: "Registration of Mortgage" },
  { key: "teraview", label: "Teraview — title searches" },
  { key: "sheriff", label: "Sheriff's Certificates" },
];

/** The live rate value behind each adjustable field, for the placeholder. */
const RATE_KEY_OF: Record<string, keyof ClosingCostRates> = {
  legal_transfer: "legalTransfer",
  legal_mortgage: "legalMortgage",
  legal_title_submission: "legalTitleSubmission",
  admin_fee: "adminFee",
  reg_transfer: "regTransfer",
  reg_mortgage: "regMortgage",
  teraview: "teraview",
  sheriff: "sheriff",
};

interface FirmOption {
  firm_key: string;
  label: string;
  firm_badge: string | null;
  brand_color: string | null;
  rates: ClosingCostRates;
}

interface IssuedEstimate {
  id: string;
  line_items: unknown;
  issued_at: string | null;
  has_pdf: boolean;
  file_no_display: string | null;
  /** The firm this estimate was quoted under. */
  firm_key: string | null;
}

interface DealSummary {
  id: string;
  file_number: string | null;
  property_address: string | null;
  closing_date: string | null;
}

interface FormState {
  firmKey: string;
  statementType: string;
  fileNo: string;
  purchasers: string;
  propertyAddress: string;
  closingDate: string;
  price: string;
  deposit: string;
  mortgage: string;
  isToronto: boolean;
  isFirstTimeBuyer: boolean;
  isCashDeal: boolean;
  titlePremiumOverride: string;
  propertyTaxAdjustment: string;
  /** key → typed text; blank means "use the firm's figure". */
  adjustments: Record<string, string>;
}

const EMPTY_FORM: FormState = {
  firmKey: "",
  statementType: "draft",
  fileNo: "",
  purchasers: "",
  propertyAddress: "",
  closingDate: "",
  price: "",
  deposit: "",
  mortgage: "",
  isToronto: false,
  isFirstTimeBuyer: false,
  isCashDeal: false,
  titlePremiumOverride: "",
  propertyTaxAdjustment: "",
  adjustments: {},
};

function amountText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? String(n) : "";
}

const ClosingCostCalculator: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Bumped by the retry button to re-run the load effect. */
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(
    null,
  );

  const [deal, setDeal] = useState<DealSummary | null>(null);
  const [issued, setIssued] = useState<IssuedEstimate | null>(null);
  const [fallbackRates, setFallbackRates] = useState<ClosingCostRates | null>(null);
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [statementTypes, setStatementTypes] = useState<StatementTypeConfig[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<FormState | null>(null);
  const [email, setEmail] = useState("");
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [downloadingMine, setDownloadingMine] = useState(false);
  const [downloadingIssued, setDownloadingIssued] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // A promise chain rather than async/await, so every setState happens in a
  // callback rather than in the effect body (react-hooks/set-state-in-effect —
  // the same idiom the dashboard layout uses). `cancelled` stops a slow
  // response from writing state after the client has navigated away.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/closing-estimate")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data?.success) {
          throw new Error(data?.error || "Could not load your estimate");
        }

        setDeal(data.deal ?? null);
        setIssued(data.issued ?? null);
        setFallbackRates(data.rates ?? null);
        setFirms(data.firms ?? []);
        setStatementTypes(data.statement_types ?? []);

        const p = data.prefill ?? {};
        const mortgageText = amountText(p.mortgage_amount);
        const seeded: FormState = {
          ...EMPTY_FORM,
          firmKey: p.firm_key ?? data.firms?.[0]?.firm_key ?? "",
          statementType: p.statement_type ?? "draft",
          fileNo: p.file_no_display ?? "",
          purchasers: p.purchasers ?? p.client_name ?? "",
          propertyAddress: p.property_address ?? "",
          closingDate: p.closing_date ?? "",
          price: amountText(p.purchase_price),
          deposit: amountText(p.deposit_paid),
          mortgage: mortgageText,
          isToronto: Boolean(p.is_toronto),
          isFirstTimeBuyer: Boolean(p.is_first_time_buyer),
          isCashDeal: Boolean(data.issued) && !mortgageText,
          titlePremiumOverride: amountText(p.title_premium_override),
          propertyTaxAdjustment: amountText(p.property_tax_adjustment),
        };
        setForm(seeded);
        setInitialForm(seeded);
        setEmail(p.email ?? "");
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

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setAdjustment = (key: string, value: string) =>
    setForm((prev) => ({
      ...prev,
      adjustments: { ...prev.adjustments, [key]: value },
    }));

  /** The firm's issued figures, rehydrated from the frozen snapshot. */
  const issuedStatement = useMemo(
    () => (issued ? snapshotToStatement(issued.line_items) : null),
    [issued],
  );

  const activeFirm = useMemo(
    () => firms.find((f) => f.firm_key === form.firmKey) ?? firms[0] ?? null,
    [firms, form.firmKey],
  );

  /** The chosen firm's schedule, or whatever the API resolved when there is none. */
  /**
   * The schedule the client's own numbers are built from.
   *
   * While they are still on the firm that quoted them, the FROZEN rates from
   * the issued estimate win — a fee the firm raised last week must not
   * silently reprice what this client was actually quoted. Switch to another
   * firm and that firm's current standard applies instead, because the frozen
   * per-file rates belonged to the other firm's quote.
   */
  const baseRates = useMemo(() => {
    const onIssuingFirm = issued?.firm_key && form.firmKey === issued.firm_key;
    if (onIssuingFirm && fallbackRates) return fallbackRates;
    return activeFirm?.rates ?? fallbackRates ?? ratesFromConfigRow(null);
  }, [activeFirm, fallbackRates, issued, form.firmKey]);

  const rates = useMemo(() => {
    const overrides: Record<string, number> = {};
    for (const field of ADJUST_FIELDS) {
      const parsed = parseAmountInput(form.adjustments[field.key] ?? "");
      if (parsed === null) continue;
      overrides[field.key] = parsed;
    }
    if (Object.keys(overrides).length === 0) return baseRates;

    return ratesFromConfigRow({
      reg_transfer: baseRates.regTransfer,
      reg_mortgage: baseRates.regMortgage,
      teraview: baseRates.teraview,
      sheriff: baseRates.sheriff,
      legal_transfer: baseRates.legalTransfer,
      legal_mortgage: baseRates.legalMortgage,
      legal_title_submission: baseRates.legalTitleSubmission,
      admin_fee: baseRates.adminFee,
      hst_rate: baseRates.hstRate,
      rebate_ontario_max: baseRates.rebateOntarioMax,
      rebate_toronto_max: baseRates.rebateTorontoMax,
      title_premium_base: baseRates.titlePremiumBase,
      title_premium_rate: baseRates.titlePremiumRate,
      title_premium_min: baseRates.titlePremiumMin,
      ltt_tiers: baseRates.lttTiers,
      mltt_tiers: baseRates.mlttTiers,
      ...overrides,
    });
  }, [baseRates, form.adjustments]);

  const activeStatementType = useMemo(
    () => statementTypes.find((t) => t.type_key === form.statementType) ?? null,
    [statementTypes, form.statementType],
  );

  const inputs: ClosingCostInputs = useMemo(
    () => ({
      price: parseAmountInput(form.price) ?? 0,
      deposit: parseAmountInput(form.deposit) ?? 0,
      mortgage: form.isCashDeal ? 0 : (parseAmountInput(form.mortgage) ?? 0),
      isToronto: form.isToronto,
      isFirstTimeBuyer: form.isFirstTimeBuyer,
      titlePremiumOverride: parseAmountInput(form.titlePremiumOverride),
      propertyTaxAdjustment: parseAmountInput(form.propertyTaxAdjustment),
    }),
    [form],
  );

  const myStatement = useMemo(
    () => computeStatement(inputs, rates),
    [inputs, rates],
  );

  /** True once the client has moved away from the firm's figures. */
  const changed = useMemo(() => {
    if (!initialForm) return false;
    return JSON.stringify(form) !== JSON.stringify(initialForm);
  }, [form, initialForm]);

  /**
   * The exact body the PDF, email and save routes all receive. Memoised so the
   * auto-save effect below can key off it instead of re-firing every render.
   */
  const requestBody = useMemo(
    () => ({
      firm_key: form.firmKey || null,
      statement_type: form.statementType || null,
      file_no_display: form.fileNo || null,
      purchasers: form.purchasers || null,
      property_address: form.propertyAddress || null,
      closing_date: form.closingDate || null,
      purchase_price: inputs.price,
      deposit_paid: inputs.deposit,
      mortgage_amount: inputs.mortgage,
      is_toronto: inputs.isToronto,
      is_first_time_buyer: inputs.isFirstTimeBuyer,
      title_premium_override: inputs.titlePremiumOverride,
      property_tax_adjustment: inputs.propertyTaxAdjustment,
      adjustments: form.adjustments,
    }),
    [form, inputs],
  );

  const buildBody = () => requestBody;

  // ── Mirror the client's own numbers onto their file ──
  //
  // The back office wants to see what the client is actually planning around —
  // the price they have in mind and the closing costs they are expecting — so
  // the latest calculation is saved to their deal as an admin-only task. It is
  // NOT written to the firm's issued-estimate records; see the save route.
  //
  // Debounced and deduplicated, because this runs while the client is still
  // typing: only a settled set of figures, different from the last set sent, is
  // worth a write. Silent in both directions — the client did not ask for this,
  // so neither success nor failure interrupts them. The route itself no-ops
  // when there is no price yet or no file to attach to.
  const savedSignature = useRef<string | null>(null);

  useEffect(() => {
    if (loading || loadError || !initialForm) return;
    // `changed` is the gate that makes these the CLIENT's figures. Untouched,
    // the form still shows the file's own prefill, and mirroring that back
    // would tell the office nothing it did not already have.
    if (!changed) return;
    if (requestBody.purchase_price <= 0) return;

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
          // Release the claim so the next edit retries rather than assuming
          // the office already has these numbers.
          savedSignature.current = null;
        });
    }, 1200);

    return () => clearTimeout(timer);
  }, [loading, loadError, initialForm, changed, requestBody]);

  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /** The client's own numbers. Always watermarked DRAFT. */
  const handleDownloadMine = async () => {
    if (inputs.price <= 0) {
      showToast("Enter your purchase price first", "error");
      return;
    }
    setDownloadingMine(true);
    try {
      const res = await fetch("/api/closing-estimate/my-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not build your PDF");
      }
      saveBlob(
        await res.blob(),
        `my-closing-cost-estimate-${form.fileNo || "draft"}.pdf`,
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not build your PDF",
        "error",
      );
    } finally {
      setDownloadingMine(false);
    }
  };

  /** The statement the firm issued — the official document. */
  const handleDownloadIssued = async () => {
    setDownloadingIssued(true);
    try {
      const res = await fetch("/api/closing-estimate/pdf");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not open your statement");
      }
      saveBlob(
        await res.blob(),
        `closing-costs-${deal?.file_number || "statement"}.pdf`,
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not open your statement",
        "error",
      );
    } finally {
      setDownloadingIssued(false);
    }
  };

  const handleEmail = async () => {
    if (!email.trim()) {
      showToast("Enter an email address", "error");
      return;
    }
    if (inputs.price <= 0) {
      showToast("Enter your purchase price first", "error");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/closing-estimate/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildBody(), to: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Could not send the email");
      }
      showToast(
        data.pdf_attached
          ? `Sent to ${data.sent_to} with the PDF attached`
          : `Sent to ${data.sent_to} — the PDF could not be attached`,
        data.pdf_attached ? "success" : "error",
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not send the email",
        "error",
      );
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500">
        <Loader2 size={16} className="animate-spin" /> Loading your estimate…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <TriangleAlert size={28} className="mx-auto text-gray-300" />
        <p className="mt-3 text-sm text-gray-700">{loadError}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-5 text-sm font-semibold"
          style={{ color: BRAND }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <div
          role="status"
          className={`fixed right-6 top-20 z-50 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
            toast.type === "error" ? "bg-red-600" : "bg-gray-900"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Closing cost estimate</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Enter your purchase price, the deposit you have already paid and your
          mortgage amount, and we will provide an <strong>estimate</strong> of how
          much you need to bring to your closing.
        </p>
      </div>

      {/* Driven by the selected statement type, not hard-coded: picking "Final
          account" must not leave a "this is a draft" warning on screen. The
          amber treatment is reserved for a type that still carries a watermark
          — i.e. one that is explicitly not final. */}
      {activeStatementType && (
        <div
          className={`mb-5 flex items-start gap-2 rounded-lg border px-4 py-3 text-[13px] ${
            activeStatementType.show_watermark
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-gray-200 bg-gray-50 text-gray-600"
          }`}
        >
          <Info size={15} className="mt-0.5 shrink-0" />
          <span>
            {activeStatementType.disclaimer_intro}
            {activeStatementType.footer_note
              ? ` ${activeStatementType.footer_note}`
              : ""}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* ── Left: your numbers ── */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-[11px] font-bold tracking-wide" style={{ color: BRAND }}>
              YOUR NUMBERS
            </h2>
            <p className="mt-1 text-[11px] text-gray-400">
              A few quick details from your purchase agreement.
            </p>

            <div className="mt-4 space-y-4">
              {/* Shown whenever there is at least one firm, so the control is
                  never silently absent. With one firm it reads as a label. */}
              {firms.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold tracking-wide text-gray-500">
                    FIRM
                  </p>
                  <Segmented
                    options={firms.map((f) => ({
                      value: f.firm_key,
                      label: f.label,
                    }))}
                    value={activeFirm?.firm_key ?? ""}
                    onChange={(v) => update("firmKey", v)}
                  />
                </div>
              )}

              {statementTypes.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold tracking-wide text-gray-500">
                    STATEMENT TYPE
                  </p>
                  <Segmented
                    options={statementTypes.map((t) => ({
                      value: t.type_key,
                      label: t.label,
                    }))}
                    value={form.statementType}
                    onChange={(v) => update("statementType", v)}
                  />
                </div>
              )}

              {/* File details — optional, and printed at the head of the PDF. */}
              <details className="group rounded-lg border border-gray-200">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
                  <span className="text-[11px] font-bold tracking-wide text-gray-500">
                    FILE DETAILS
                    <span className="ml-1.5 font-normal text-gray-400">— optional</span>
                  </span>
                  <ChevronDown
                    size={14}
                    className="text-gray-400 transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="space-y-3 px-3 pb-3">
                  <TextField
                    label="File number"
                    value={form.fileNo}
                    onChange={(v) => update("fileNo", v)}
                  />
                  <TextField
                    label="Purchaser(s)"
                    value={form.purchasers}
                    onChange={(v) => update("purchasers", v)}
                  />
                  <TextField
                    label="Property address"
                    value={form.propertyAddress}
                    onChange={(v) => update("propertyAddress", v)}
                  />
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700">
                      Closing date
                    </label>
                    <input
                      type="date"
                      value={form.closingDate}
                      onChange={(e) => update("closingDate", e.target.value)}
                      className={`${inputClass} mt-1.5`}
                    />
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Appears on your estimate and the PDF statement.
                  </p>
                </div>
              </details>

              <MoneyField
                label="Purchase price"
                hint="the agreed price of the home"
                value={form.price}
                onChange={(v) => update("price", v)}
              />
              <MoneyField
                label="Deposit already paid"
                hint="paid to the seller or brokerage when you signed"
                value={form.deposit}
                onChange={(v) => update("deposit", v)}
              />
              <MoneyField
                label="Mortgage amount"
                hint="what your lender is advancing"
                value={form.isCashDeal ? "" : form.mortgage}
                disabled={form.isCashDeal}
                placeholder={form.isCashDeal ? "0 — cash purchase" : "0"}
                onChange={(v) => update("mortgage", v)}
              />

              <div>
                <label className="block text-[13px] font-semibold text-gray-800">
                  Where is the property?
                </label>
                <Segmented
                  options={[
                    { value: "on", label: "Elsewhere in Ontario" },
                    { value: "to", label: "City of Toronto" },
                  ]}
                  value={form.isToronto ? "to" : "on"}
                  onChange={(v) => update("isToronto", v === "to")}
                />
                <p className="mt-1.5 text-[11px] text-gray-400">
                  Toronto charges a second, municipal land transfer tax.
                </p>
              </div>

              <CheckboxRow
                checked={form.isFirstTimeBuyer}
                onChange={(v) => update("isFirstTimeBuyer", v)}
                label="I am a first-time home buyer"
                hint={`Applies the land transfer tax rebate — up to ${formatCurrency(
                  rates.rebateOntarioMax,
                  { cents: false },
                )} in Ontario, plus ${formatCurrency(rates.rebateTorontoMax, {
                  cents: false,
                })} in Toronto.`}
              />

              <CheckboxRow
                checked={form.isCashDeal}
                onChange={(v) => update("isCashDeal", v)}
                label="This is a cash deal — no mortgage"
                hint="Removes the mortgage registration and the mortgage portion of the legal fee."
              />
            </div>
          </div>

          {/* ── Adjust these ── */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/60">
            <button
              type="button"
              onClick={() => setAdjustOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span>
                <span
                  className="text-[11px] font-bold tracking-wide"
                  style={{ color: BRAND }}
                >
                  ADJUST THESE
                </span>
                <span className="ml-1.5 text-[11px] text-gray-400">
                  — fixed costs only
                </span>
              </span>
              <ChevronDown
                size={15}
                className={`text-gray-400 transition-transform ${
                  adjustOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {adjustOpen && (
              <div className="px-4 pb-4">
                <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
                  These default to your firm&rsquo;s standard charges. Changing one
                  affects only your own estimate on this page — it does not change
                  what you are billed. Land transfer tax and the rebates are set by
                  law and cannot be adjusted.
                </p>

                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  {ADJUST_FIELDS.map((field) => (
                    <div key={field.key}>
                      <label className="block text-[11px] font-semibold leading-snug text-gray-700">
                        {field.label}
                      </label>
                      <div className="relative mt-1.5">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">
                          $
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={form.adjustments[field.key] ?? ""}
                          onChange={(e) => setAdjustment(field.key, e.target.value)}
                          placeholder={String(baseRates[RATE_KEY_OF[field.key]] ?? "")}
                          className={feeInputClass}
                        />
                      </div>
                    </div>
                  ))}

                  <div>
                    <label className="block text-[11px] font-semibold leading-snug text-gray-700">
                      Title insurance premium
                    </label>
                    <div className="relative mt-1.5">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">
                        $
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.titlePremiumOverride}
                        onChange={(e) => update("titlePremiumOverride", e.target.value)}
                        placeholder="auto"
                        className={feeInputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold leading-snug text-gray-700">
                      Property tax adjustment
                    </label>
                    <div className="relative mt-1.5">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">
                        $
                      </span>
                      <input
                        type="text"
                        value={form.propertyTaxAdjustment}
                        onChange={(e) =>
                          update("propertyTaxAdjustment", e.target.value)
                        }
                        placeholder="0"
                        className={feeInputClass}
                      />
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
                  Leave the title insurance premium blank to use the automatic
                  estimate. The property tax adjustment comes from your Statement of
                  Adjustments — a negative figure credits you.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      adjustments: {},
                      titlePremiumOverride: "",
                      propertyTaxAdjustment: "",
                    }))
                  }
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <RotateCcw size={13} /> Reset all
                </button>
              </div>
            )}
          </div>

          {/* ── Actions ── */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownloadMine}
              disabled={downloadingMine}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: BRAND }}
            >
              {downloadingMine ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Download size={13} />
              )}
              Download PDF
            </button>
            {/* Sends straight away — the address is prefilled from the client's
                account, so making this only scroll to the box below (which is
                already on screen) made it look like a dead button. With no
                address on file it focuses the field instead of failing. */}
            <button
              type="button"
              onClick={() => {
                if (!email.trim()) {
                  emailInputRef.current?.focus();
                  showToast("Add an email address to send it to", "error");
                  return;
                }
                void handleEmail();
              }}
              disabled={sending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {sending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Mail size={13} />
              )}
              Email it to me
            </button>
          </div>

          <div
            id="email-my-estimate"
            className="rounded-xl border border-dashed p-5"
            style={{ borderColor: BRAND }}
          >
            <p className="text-[11px] leading-relaxed text-gray-500">
              We&rsquo;ll email you a summary of this estimate with the full PDF
              breakdown attached.
            </p>
            <input
              ref={emailInputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={`${inputClass} mt-3`}
            />
            <button
              type="button"
              onClick={handleEmail}
              disabled={sending}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: BRAND }}
            >
              {sending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Mail size={13} />
              )}
              Send me the estimate
            </button>
          </div>
        </div>

        {/* ── Right: the statement ── */}
        <div className="space-y-5">
          {/* The firm's issued statement, when there is one. */}
          {issuedStatement && (
            <div
              className="rounded-xl border-2 bg-white p-5 sm:p-6"
              style={{ borderColor: BRAND }}
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide text-white"
                    style={{ backgroundColor: BRAND }}
                  >
                    FROM YOUR LAWYER
                  </span>
                  <p className="mt-2 text-[11px] text-gray-500">
                    {deal?.file_number ? `File ${deal.file_number}` : "Your file"}
                    {issued?.issued_at
                      ? ` · prepared ${issued.issued_at.slice(0, 10)}`
                      : ""}
                  </p>
                </div>
                {issued?.has_pdf && (
                  <button
                    type="button"
                    onClick={handleDownloadIssued}
                    disabled={downloadingIssued}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {downloadingIssued ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Download size={13} />
                    )}
                    Download the signed PDF
                  </button>
                )}
              </div>

              <ClosingCostStatement
                statement={issuedStatement}
                caption="Prepared for you by your lawyer. These are the figures we quoted."
              />
            </div>
          )}

          {/* The client's own numbers. Only shown separately once they differ,
              otherwise it would just duplicate the statement above. */}
          {(changed || !issuedStatement) && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
              {issuedStatement && (
                <div className="mb-4 flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-[12px] text-gray-600">
                  <Info size={14} className="mt-0.5 shrink-0 text-gray-400" />
                  <span>
                    This is your own estimate, based on the numbers you just entered.
                    Your lawyer&rsquo;s figures are the ones above.
                  </span>
                </div>
              )}
              <ClosingCostStatement
                statement={myStatement}
                heading={
                  issuedStatement
                    ? "YOUR OWN ESTIMATE"
                    : (activeStatementType?.screen_heading ??
                      "ESTIMATED STATEMENT OF ACCOUNT")
                }
                caption={
                  issuedStatement
                    ? undefined
                    : (activeStatementType?.disclaimer_intro ?? undefined)
                }
                firmBadge={activeFirm?.firm_badge ?? null}
              />
            </div>
          )}

          {/* The lead line follows the selected statement type; DISCLAIMERS[1..]
              is standing legal text that applies to both. */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-[11px] leading-relaxed text-gray-500">
            <p className="font-semibold text-gray-700">
              {activeStatementType?.disclaimer_intro ?? DISCLAIMERS[0]}
            </p>
            <ul className="mt-2 space-y-1.5">
              {DISCLAIMERS.slice(1).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Two-or-more mutually exclusive choices rendered as a pill row. */
const Segmented: React.FC<{
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}> = ({ options, value, onChange }) => (
  <div
    className="mt-2 grid gap-2"
    style={{ gridTemplateColumns: `repeat(${Math.max(options.length, 1)}, minmax(0, 1fr))` }}
  >
    {options.map((opt) => {
      const active = value === opt.value;
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-lg border px-2 py-2 text-[12px] font-medium transition ${
            active
              ? "border-[#C10007] bg-red-50 text-[#C10007]"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

const CheckboxRow: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}> = ({ checked, onChange, label, hint }) => (
  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 h-4 w-4 accent-[#C10007]"
    />
    <span className="text-[13px] leading-snug text-gray-700">
      {label}
      {hint && <span className="mt-0.5 block text-[11px] text-gray-400">{hint}</span>}
    </span>
  </label>
);

/** Labelled dollar input with a leading "$". */
const MoneyField: React.FC<{
  label: string;
  hint?: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}> = ({ label, hint, value, disabled, placeholder, onChange }) => (
  <div>
    <label className="block text-[13px] font-semibold text-gray-800">
      {label}
      {hint && (
        <span className="mt-0.5 block text-[11px] font-normal text-gray-400">{hint}</span>
      )}
    </label>
    <div className="relative mt-2">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "0"}
        className={`${inputClass} pl-7 tabular-nums disabled:bg-gray-50 disabled:text-gray-400`}
      />
    </div>
  </div>
);

const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
  <div>
    <label className="block text-[12px] font-semibold text-gray-700">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} mt-1.5`}
    />
  </div>
);

export default ClosingCostCalculator;
