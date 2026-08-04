"use client";

import React from "react";
import type { Statement, StatementLine } from "@/lib/closingCosts";
import { formatCurrency } from "@/lib/formatCurrency";

// Client-facing rendering of a closing-cost statement.
//
// Draws whatever Statement it is handed, so the SAME component renders both the
// firm's issued figures (rehydrated from the frozen snapshot) and the client's
// own what-if numbers. Keeping one renderer is what guarantees the two look
// identical apart from the labelling around them.

const BRAND = "#C10007";

const Line: React.FC<{ line: StatementLine }> = ({ line }) => {
  const isCredit = line.amount < 0;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <span
          className={`text-[13px] ${isCredit ? "text-gray-500" : "text-gray-700"}`}
        >
          {line.label}
        </span>
        {line.badge && (
          <span
            className="ml-2 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide"
            style={{ backgroundColor: "#FEF2F2", color: BRAND }}
          >
            {line.badge}
          </span>
        )}
        {line.sublabel && (
          <span className="mt-0.5 block text-[11px] italic text-gray-400">
            {line.sublabel}
          </span>
        )}
      </div>
      <span
        className={`shrink-0 text-[13px] tabular-nums ${
          isCredit ? "text-gray-500" : "text-gray-800"
        }`}
      >
        {formatCurrency(line.amount)}
      </span>
    </div>
  );
};

const ClosingCostStatement: React.FC<{
  statement: Statement;
  /** Small caption under the heading. */
  caption?: string;
  heading?: string;
  /** The acting firm, shown as a chip on the "Legal & Admin Fees" heading. */
  firmBadge?: string | null;
}> = ({
  statement,
  caption,
  heading = "ESTIMATED STATEMENT OF ACCOUNT",
  firmBadge = null,
}) => {
  const b = statement.balance;

  return (
    <div>
      <h2 className="text-sm font-bold tracking-wide text-gray-900">{heading}</h2>
      {caption && <p className="mt-1 text-[11px] text-gray-400">{caption}</p>}

      <div className="mt-5 space-y-5">
        {statement.groups.map((group) => (
          <div key={group.key}>
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-1.5">
              <h3
                className="text-[11px] font-bold tracking-wide"
                style={{ color: BRAND }}
              >
                {group.title.toUpperCase()}
              </h3>
              {firmBadge && group.key === "legal" && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-gray-500">
                  {firmBadge}
                </span>
              )}
            </div>
            <div className="mt-1.5 divide-y divide-gray-50">
              {group.lines.map((line) => (
                <Line key={line.key} line={line} />
              ))}
            </div>
          </div>
        ))}

        {/* HST sits outside the groups — it is charged on only some of them. */}
        <div className="border-t border-dashed border-gray-200 pt-3">
          <Line
            line={{
              key: "hst",
              label: statement.hst.label,
              amount: statement.hst.amount,
            }}
          />
        </div>
      </div>

      <div
        className="mt-5 flex items-center justify-between gap-4 rounded-lg px-4 py-3 text-white"
        style={{ backgroundColor: BRAND }}
      >
        <span className="text-[13px] font-bold">
          Total legal fees, taxes &amp; disbursements
        </span>
        <span className="shrink-0 text-lg font-bold tabular-nums">
          {formatCurrency(statement.total)}
        </span>
      </div>

      {/* A Statement of Adjustments item, so it sits OUTSIDE the total above and
          is added to the balance separately. */}
      {statement.propertyTax && (
        <div className="mt-5">
          <h3 className="text-[11px] font-bold tracking-wide" style={{ color: BRAND }}>
            PROPERTY TAX
          </h3>
          <div className="mt-2 border-t border-gray-100 pt-2">
            <Line line={statement.propertyTax} />
          </div>
        </div>
      )}

      <div
        className="mt-4 rounded-lg border border-dashed px-4 py-4"
        style={{ borderColor: BRAND }}
      >
        <p className="text-[10px] font-bold tracking-wide" style={{ color: BRAND }}>
          FUNDS REQUIRED ON CLOSING
        </p>
        <dl className="mt-2.5 space-y-1.5 text-[12px]">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Purchase price</dt>
            <dd className="tabular-nums text-gray-700">
              {formatCurrency(b.purchasePrice)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">less deposit already paid</dt>
            <dd className="tabular-nums text-gray-700">
              {formatCurrency(-b.depositPaid)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">less mortgage advance from your lender</dt>
            <dd className="tabular-nums text-gray-700">
              {formatCurrency(-b.mortgageAmount)}
            </dd>
          </div>
          {b.propertyTaxAdjustment !== 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">
                {b.propertyTaxAdjustment > 0
                  ? "plus property tax adjustment"
                  : "less property tax credit"}
              </dt>
              <dd className="tabular-nums text-gray-700">
                {formatCurrency(b.propertyTaxAdjustment)}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">plus total closing costs</dt>
            <dd className="tabular-nums text-gray-700">
              + {formatCurrency(b.closingCosts)}
            </dd>
          </div>
        </dl>
        <div className="mt-3 flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
          <span className="text-[13px] font-bold" style={{ color: BRAND }}>
            Estimated balance due on closing
          </span>
          <span
            className="shrink-0 text-xl font-bold tabular-nums"
            style={{ color: BRAND }}
          >
            {formatCurrency(b.balanceDue)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ClosingCostStatement;
