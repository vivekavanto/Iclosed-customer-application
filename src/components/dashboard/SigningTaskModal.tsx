"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

const BOOKED_LABEL = "I have booked my appointment";

const SigningTaskModal: React.FC<{
  open: boolean;
  taskId: string | null;
  dealId: string | null;
  /** Calendar the admin assigned to this file, for the button label. */
  calendarName: string | null;
  title: string;
  subtitle?: string;
  side: "purchase" | "sale" | null;
  closingDate: string;
  onClose: () => void;
  onSaved: (submitted: boolean) => void;
  onError: (message: string) => void;
}> = ({ open, taskId, dealId, calendarName, title, subtitle, side, closingDate, onClose, onSaved, onError }) => {
  const [booked, setBooked] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  // Prefill from a saved draft.
  useEffect(() => {
    if (!open || !taskId) return;
    setBooked(false);
    setTouched(false);
    let cancelled = false;
    fetch(`/api/task-responses?task_id=${encodeURIComponent(taskId)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        const r = (data.responses ?? []).find((x: { field_label?: string }) => x.field_label === BOOKED_LABEL);
        if (r) setBooked(r.value === "true");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, taskId]);

  if (!open) return null;

  const waitingFor =
    side === "sale"
      ? "receiving the payout statement from your lender, and may be rescheduled if we have not received it by then."
      : "receiving your mortgage instructions from your lender, and may be rescheduled if we have not received them by then.";

  const save = async (draft: boolean) => {
    if (!taskId) return;
    if (!draft) {
      setTouched(true);
      if (!booked) return;
    }
    setBusy(draft ? "draft" : "submit");
    try {
      const res = await fetch("/api/task-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          responses: [{ field_label: BOOKED_LABEL, field_type: "checkbox", value: booked ? "true" : "false" }],
          draft,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error ?? "Failed");
      onSaved(!draft);
    } catch {
      onError(draft ? "Could not save your draft. Please try again." : "Could not submit. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-[70] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label={title}>
        <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 px-6 sm:px-8 pt-6 pb-4 border-b border-gray-100">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
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

          <div className="px-6 sm:px-8 py-6 space-y-5 overflow-y-auto">
            <p className="text-sm text-gray-600 leading-relaxed">
              Book a time to sign your closing documents.
            </p>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs leading-relaxed text-amber-800">
                Your signing date must be 3 days prior to the closing day ({closingDate}). It is subject to {waitingFor}
              </p>
            </div>
            <a
              href={`/signing?${new URLSearchParams({
                ...(dealId ? { deal: dealId } : {}),
                ...(side ? { side } : {}),
              }).toString()}`}
              className="inline-flex items-center rounded-lg bg-[#C10007] px-4 py-2.5 text-sm font-semibold !text-white hover:bg-[#a30006]"
            >
              {calendarName ? (
                `Book ${calendarName}'s signing appointment`
              ) : (
                "Book your signing appointment"
              )}
            </a>
            <div>
              <label className="flex items-center gap-3 cursor-pointer text-sm font-semibold text-gray-900">
                <input
                  type="checkbox"
                  checked={booked}
                  onChange={(e) => setBooked(e.target.checked)}
                  className="h-5 w-5 rounded accent-[#C10007] cursor-pointer"
                />
                {BOOKED_LABEL}
              </label>
              {touched && !booked && (
                <p className="mt-1.5 text-xs text-[#C10007]">Please confirm once you have booked.</p>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 px-6 sm:px-8 py-5 border-t border-gray-100">
            <button
              type="button"
              onClick={() => save(true)}
              disabled={busy !== null}
              className="cursor-pointer sm:flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-[#C10007]/60 bg-white px-4 py-3 text-sm font-semibold text-[#C10007] hover:bg-[#FEF2F2] transition-colors disabled:opacity-60"
            >
              {busy === "draft" && <Loader2 size={15} className="animate-spin" />}
              Save as Draft
            </button>
            <button
              type="button"
              onClick={() => save(false)}
              disabled={busy !== null}
              className="cursor-pointer sm:flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#C10007] px-4 py-3 text-sm font-semibold text-white hover:bg-[#a30006] transition-colors disabled:opacity-60"
            >
              {busy === "submit" && <Loader2 size={15} className="animate-spin" />}
              I&apos;ve booked
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SigningTaskModal;
