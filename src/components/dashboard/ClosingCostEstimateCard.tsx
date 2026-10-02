"use client";

import Link from "next/link";
import { DollarSign } from "lucide-react";

/* ════════════════════════════════════════════
   CLOSING COST ESTIMATE CARD
   Dashboard right-column promo that invites the client to estimate the funds
   they'll need on closing day. Purely presentational — the caller decides what
   the button does by passing either `href` (navigates) or `onEstimate`
   (in-page drawer/modal). With neither, the button is disabled so it can never
   read as a live control that quietly does nothing.
════════════════════════════════════════════ */

const ClosingCostEstimateCard: React.FC<{
  href?: string;
  onEstimate?: () => void;
  /** Disabled until the Agreement of Purchase and Sale is uploaded. */
  locked?: boolean;
  /** Sale files estimate proceeds instead of closing costs. */
  kind?: "purchase" | "sale";
}> = ({ href, onEstimate, locked = false, kind = "purchase" }) => {
  const heading = kind === "sale" ? "Estimate your sale proceeds" : "Estimate your closing cost";
  const buttonClass =
    "w-full flex items-center justify-center rounded-xl bg-[#C10007] px-4 py-3 text-sm font-bold text-white transition-colors duration-200 hover:bg-[#a30006] disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
          <DollarSign size={18} className="text-[#C10007]" strokeWidth={2} />
        </div>
        <h3 className="text-sm font-bold text-gray-900">{heading}</h3>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed mb-5">
        {kind === "sale" ? (
          <>
            Get an estimate of what you&rsquo;ll receive on closing day &mdash;
            after commission, your mortgage payout, legal fees and disbursements.
          </>
        ) : (
          <>
            Get an estimate of the funds you&rsquo;ll need on closing day &mdash;
            land transfer tax, title insurance, legal fees and disbursements &mdash;
            so you can plan ahead.
          </>
        )}
      </p>

      {href && !locked ? (
        <Link href={href} className={buttonClass}>
          {heading}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onEstimate}
          disabled={!onEstimate || locked}
          className={`${buttonClass} cursor-pointer`}
        >
          {heading}
        </button>
      )}

      <p className="mt-3 text-[11px] text-[#C10007]/60">
        {locked
          ? "Upload your Agreement of Purchase and Sale to see your estimate."
          : <>For planning only &mdash; no payment is due yet.</>}
      </p>
    </div>
  );
};

export default ClosingCostEstimateCard;
