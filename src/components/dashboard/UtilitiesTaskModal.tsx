"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { utilityContactsFor } from "@/lib/utilityContacts";

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

  const providers = utilityContactsFor(city);
  // Header uses the client's own city, e.g. "Courtice" not "Clarington/Newcastle/Courtice".
  const cityLabel = (city ?? "").trim() || providers?.name;

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
                  Your providers in {cityLabel}
                </p>
                {providers.clientContactsAll && (
                  <p className="text-sm text-gray-600">
                    {providers.name} does not accept notices from law offices. Please contact your
                    property tax, water and hydro providers yourself.
                  </p>
                )}
                <ul className="space-y-2">
                  {providers.rows.map((row) => (
                    <li key={row.service} className="text-sm text-gray-600">
                      {row.service}
                      {row.provider && ` \u2014 ${row.provider}`}
                      {row.phone && ` \u00b7 ${row.phone}`}
                      {/* Only where the contact sheet says CLIENT MUST CONTACT. */}
                      {row.clientCalls && (
                        <span className="font-semibold text-gray-900"> \u00b7 Call the provider</span>
                      )}
                      {row.verify && (
                        <span className="block text-xs text-gray-400">
                          The provider depends on your address. Check a recent bill.
                        </span>
                      )}
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
