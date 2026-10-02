"use client";

import Link from "next/link";

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
  const subtitle = locked
    ? "Upload your Agreement of Purchase and Sale to unlock"
    : kind === "sale"
      ? "Based on your quote and mortgage balance"
      : "Based on your quote and purchase price";
  const buttonClass =
    "flex-shrink-0 inline-flex items-center justify-center rounded-lg bg-[#C10007] px-4 py-2 text-sm font-bold text-white transition-colors duration-200 hover:bg-[#a30006] disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-gray-900">{heading}</h3>
        <p className="text-xs text-gray-500 leading-snug mt-0.5">{subtitle}</p>
      </div>

      {href && !locked ? (
        <Link href={href} className={buttonClass}>
          Estimate
        </Link>
      ) : (
        <button
          type="button"
          onClick={onEstimate}
          disabled={!onEstimate || locked}
          className={`${buttonClass} cursor-pointer`}
        >
          Estimate
        </button>
      )}
    </div>
  );
};

export default ClosingCostEstimateCard;
