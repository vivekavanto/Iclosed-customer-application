"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

const CORRECT_LABEL = "Are these details correct?";
const CORRECTION_LABEL = "What needs to be corrected?";
const YES = "Yes, all correct";
const NO = "Something is wrong";

function money(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

const PropertyDetailsTaskModal: React.FC<{
  open: boolean;
  taskId: string | null;
  title: string;
  subtitle?: string;
  address: string;
  priceLabel: string;
  price: number | null;
  deposit: number | null;
  closingDate: string;
  onClose: () => void;
  /** Called after a draft save or submit succeeds. */
  onSaved: (submitted: boolean) => void;
  onError: (message: string) => void;
}> = ({
  open,
  taskId,
  title,
  subtitle,
  address,
  priceLabel,
  price,
  deposit,
  closingDate,
  onClose,
  onSaved,
  onError,
}) => {
  const [answer, setAnswer] = useState<string>("");
  const [correction, setCorrection] = useState("");
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [touched, setTouched] = useState(false);

  // Prefill from a saved draft.
  useEffect(() => {
    if (!open || !taskId) return;
    setAnswer("");
    setCorrection("");
    setTouched(false);
    let cancelled = false;
    fetch(`/api/task-responses?task_id=${encodeURIComponent(taskId)}`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        for (const r of data.responses ?? []) {
          if (r.field_label === CORRECT_LABEL) setAnswer(r.value ?? "");
          if (r.field_label === CORRECTION_LABEL) setCorrection(r.value ?? "");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, taskId]);

  if (!open) return null;

  const wrong = answer === NO;
  const answerError = touched && !answer;
  const correctionError = touched && wrong && !correction.trim();

  const save = async (draft: boolean) => {
    if (!taskId) return;
    if (!draft) {
      setTouched(true);
      if (!answer || (wrong && !correction.trim())) return;
    }
    setBusy(draft ? "draft" : "submit");
    try {
      const responses = [
        { field_label: CORRECT_LABEL, field_type: "radio", value: answer },
        ...(wrong
          ? [
              {
                field_label: CORRECTION_LABEL,
                field_type: "textarea",
                value: correction.trim(),
              },
            ]
          : []),
      ];
      const res = await fetch("/api/task-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, responses, draft }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error ?? "Failed");
      onSaved(!draft);
    } catch {
      onError(
        draft
          ? "Could not save your draft. Please try again."
          : "Could not submit. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  const details = [
    { label: "Property address", value: address || "—" },
    { label: priceLabel, value: money(price) },
    { label: "Deposit", value: money(deposit) },
    { label: "Closing date", value: closingDate },
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-6 sm:px-8 pt-6 pb-4 border-b border-gray-100">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              {subtitle && (
                <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 sm:px-8 py-6 space-y-5 overflow-y-auto">
            <p className="text-[15px] text-gray-600 leading-relaxed">
              We took these details from your intake form. Please check them and
              let us know if anything is wrong.
            </p>

            <div className="rounded-xl border border-gray-200 px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
              {details.map((d) => (
                <div key={d.label} className="min-w-0">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                    {d.label}
                  </p>
                  <p className="ph-mask text-sm font-bold text-gray-900">
                    {d.value}
                  </p>
                </div>
              ))}
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-gray-900 mb-2">
                {CORRECT_LABEL} <span className="text-[#C10007]">*</span>
              </legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {[YES, NO].map((opt) => (
                  <label
                    key={opt}
                    className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="property-details-correct"
                      value={opt}
                      checked={answer === opt}
                      onChange={() => setAnswer(opt)}
                      className="h-4 w-4 accent-[#C10007] cursor-pointer"
                    />
                    {opt}
                  </label>
                ))}
              </div>
              {answerError && (
                <p className="text-xs text-[#C10007] mt-1.5">
                  Please choose an option.
                </p>
              )}
            </fieldset>

            {wrong && (
              <div>
                <label
                  htmlFor="property-details-correction"
                  className="block text-sm font-semibold text-gray-900 mb-2"
                >
                  {CORRECTION_LABEL} <span className="text-[#C10007]">*</span>
                </label>
                <textarea
                  id="property-details-correction"
                  rows={2}
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  placeholder="e.g. The closing date should be one day later"
                  className={`w-full rounded-lg border px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C10007]/20 ${correctionError ? "border-[#C10007]" : "border-gray-200"}`}
                />
                {correctionError && (
                  <p className="text-xs text-[#C10007] mt-1">
                    Please tell us what needs to be corrected.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 px-6 sm:px-8 py-5 border-t border-gray-100">
            <button
              type="button"
              onClick={() => save(true)}
              disabled={busy !== null}
              className="cursor-pointer sm:flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-[#C10007]/60 bg-white px-4 py-3 text-sm font-semibold text-[#C10007] hover:bg-[#FEF2F2] transition-colors disabled:opacity-60"
            >
              {busy === "draft" && (
                <Loader2 size={15} className="animate-spin" />
              )}
              Save as Draft
            </button>
            <button
              type="button"
              onClick={() => save(false)}
              disabled={busy !== null}
              className="cursor-pointer sm:flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#C10007] px-4 py-3 text-sm font-semibold text-white hover:bg-[#a30006] transition-colors disabled:opacity-60"
            >
              {busy === "submit" && (
                <Loader2 size={15} className="animate-spin" />
              )}
              Submit
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default PropertyDetailsTaskModal;
