"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

// [service, provider, phone, client calls them]
const PROVIDERS: Record<string, Array<[string, string, string, boolean]>> = {
  Toronto: [
    ["Hydro", "Toronto Hydro", "416-542-8000", true],
    ["Water and property tax", "City of Toronto", "311 or 416-392-2489", false],
  ],
  Mississauga: [
    ["Hydro", "Alectra Utilities", "1-833-253-2872", true],
    ["Water", "Region of Peel", "905-791-8711", true],
    ["Property tax", "City of Mississauga", "311", true],
  ],
  Brampton: [
    ["Hydro", "Alectra Utilities", "905-840-6300", true],
    ["Water", "Region of Peel", "905-791-8711", false],
    ["Property tax", "City of Brampton", "905-874-2000", false],
  ],
  Markham: [
    ["Hydro and water", "Alectra Utilities", "1-833-253-2872", true],
    ["Property tax", "City of Markham", "905-477-5530", false],
  ],
  "Richmond Hill": [
    ["Hydro", "Alectra Utilities", "1-833-253-2872", true],
    ["Water and property tax", "City of Richmond Hill", "905-771-8800", false],
  ],
  Oakville: [
    ["Hydro", "Oakville Hydro", "905-825-9400", true],
    ["Water", "Oakville Hydro", "905-825-9400", false],
    ["Property tax", "Town of Oakville", "905-845-6601", false],
  ],
  Burlington: [
    ["Hydro", "Burlington Hydro", "905-332-1851", true],
    ["Water", "Burlington Hydro", "905-332-1851", false],
    ["Property tax", "City of Burlington", "905-335-7750", false],
  ],
  Milton: [
    ["Hydro and water", "Milton Hydro", "905-876-4611", true],
    ["Property tax", "Town of Milton", "905-864-4142", false],
  ],
  Pickering: [
    ["Hydro", "Elexicon Energy", "905-427-9870", true],
    ["Water", "Region of Durham", "905-666-6211", true],
    ["Property tax", "City of Pickering", "905-420-4614", false],
  ],
  Ajax: [
    ["Hydro", "Elexicon Energy", "905-427-9870", true],
    ["Water", "Region of Durham", "905-666-6211", false],
    ["Property tax", "Town of Ajax", "905-683-2718", false],
  ],
  Oshawa: [
    ["Hydro", "Oshawa Power", "905-723-4623", true],
    ["Water", "Region of Durham", "905-666-6211", false],
    ["Property tax", "City of Oshawa", "905-436-3311", false],
  ],
  Newmarket: [
    ["Hydro and water", "Newmarket-Tay Power", "905-895-2309", true],
    ["Property tax", "Town of Newmarket", "905-895-5193", false],
  ],
  Barrie: [
    ["Hydro", "Alectra Utilities", "1-877-963-6900", true],
    ["Water and property tax", "City of Barrie", "705-726-4242", false],
  ],
  Hamilton: [
    ["Hydro", "Alectra Utilities", "905-522-9200", true],
    ["Water", "City of Hamilton", "905-546-8630", false],
    ["Property tax", "City of Hamilton", "905-546-2489", false],
  ],
};

function providersFor(city: string | null) {
  const c = (city ?? "").trim().toLowerCase();
  const key = Object.keys(PROVIDERS).find((k) => k.toLowerCase() === c);
  return key ? { city: key, rows: PROVIDERS[key] } : null;
}

const UtilitiesTaskModal: React.FC<{
  open: boolean;
  title: string;
  /** e.g. "Sale · 26S-0539". */
  subtitle?: string;
  /** Property city; pass "Toronto" for Toronto boroughs. */
  city: string | null;
  onClose: () => void;
  onSaveDraft: () => Promise<void>;
  onComplete: () => Promise<void>;
}> = ({ open, title, subtitle, city, onClose, onSaveDraft, onComplete }) => {
  const [busy, setBusy] = useState<"draft" | "complete" | null>(null);

  const providers = providersFor(city);

  if (!open) return null;

  const run = async (kind: "draft" | "complete") => {
    setBusy(kind);
    try {
      if (kind === "draft") await onSaveDraft();
      else {
        await onComplete();
      }
    } finally {
      setBusy(null);
    }
  };

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
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
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
          <div className="px-6 sm:px-8 py-6 space-y-5">
            <p className="text-[15px] text-gray-600 leading-relaxed">
              Please contact your utility providers to close or transfer your
              accounts and stop automatic payments. Your closing team will
              handle the municipal and transaction notices that apply to your
              file.
            </p>
            {providers ? (
              <div className="rounded-xl border border-gray-200 px-5 py-4">
                <p className="text-sm font-bold text-gray-900 mb-2">
                  Your providers in {providers.city}
                </p>
                <ul className="space-y-2">
                  {providers.rows.map(([service, provider, phone, youCall]) => (
                    <li key={service} className="text-sm text-gray-600">
                      {service} — {provider} · {phone} ·{" "}
                      {youCall ? "Please call them" : "We notify them for you"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-800">
                  Your hydro, water and gas providers depend on your address.
                  Check a recent bill, or ask our team.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 px-6 sm:px-8 py-5 border-t border-gray-100">
            <button
              type="button"
              onClick={() => run("draft")}
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
              onClick={() => run("complete")}
              disabled={busy !== null}
              className="cursor-pointer sm:flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#C10007] px-4 py-3 text-sm font-semibold text-white hover:bg-[#a30006] transition-colors disabled:opacity-60"
            >
              {busy === "complete" && (
                <Loader2 size={15} className="animate-spin" />
              )}
              Mark as complete
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default UtilitiesTaskModal;
