"use client";

import React, { useState } from "react";
import { Info } from "lucide-react";
import type { Statement, StatementLine } from "@/lib/closingCosts";
import { formatCurrency } from "@/lib/formatCurrency";

/* ════════════════════════════════════════════
   CLOSING COST BREAKDOWN

   The fee-by-fee view behind "See the full breakdown" in the estimate modal.

   Deliberately NOT the shared ClosingCostStatement: that one is the formal
   statement of account and repeats the whole balance calculation, which the
   modal already shows above this. This renders the closing-cost lines only, so
   "Total closing costs" here is exactly the "plus closing costs" figure in the
   summary — nothing is stated twice with different wording.

   Labels, badges and the plain-English explanations live here rather than in
   src/lib/closingCosts.ts, because that file is a TWIN of the admin app's copy
   and must not drift. Client-facing wording is presentation, so it belongs on
   this side of the line.
════════════════════════════════════════════ */

const BRAND = "#C10007";

/** Client-facing wording, keyed by the statement line key. */
const LABEL_OVERRIDES: Record<string, string> = {
  title_premium: "Title insurance premium (FCT)",
  title_submission: "First Canadian Title — submission & review",
  reg_transfer: "Registration of transfer",
  reg_mortgage: "Registration of mortgage",
  sheriff: "Sheriff's certificates",
  property_tax_adjustment: "Property tax & common expenses adjustments",
};

/**
 * Lines the calculator prices from a standard schedule but whose final charge
 * depends on how many searches/certificates the file actually needs. The lib
 * badges the title premium itself; these are the display-only additions.
 */
const EXTRA_BADGES: Record<string, string> = {
  teraview: "ESTIMATE",
  sheriff: "ESTIMATE",
  property_tax_adjustment: "ESTIMATE",
};

/** What each line is, in plain English, behind the ⓘ. */
const EXPLANATIONS: Record<string, string> = {
  ltt_provincial:
    "Ontario's tax on transferring land into your name, charged on a sliding scale of your purchase price. Payable to the province on closing.",
  rebate_ontario:
    "Ontario refunds part of the land transfer tax to first-time buyers, up to the provincial maximum. Eligibility is confirmed before closing.",
  ltt_municipal:
    "Toronto charges its own land transfer tax on top of the provincial one, on the same sliding-scale basis.",
  rebate_toronto:
    "Toronto's own first-time buyer rebate, applied on top of the Ontario one.",
  title_premium:
    "A one-time premium for a title insurance policy from First Canadian Title, covering you against title defects, survey issues and title fraud for as long as you own the home. Approximate until FCT issues its quote.",
  title_submission:
    "Our charge for preparing, submitting and reviewing your title insurance application.",
  reg_transfer:
    "The government's fee to register the transfer of the property into your name on title.",
  reg_mortgage:
    "The government's fee to register your lender's mortgage on title.",
  teraview:
    "Ontario land registry searches and review of the title record. The final charge depends on how many searches your file needs.",
  sheriff:
    "Searches for writs of execution — court judgments registered against you or the seller that would affect title.",
  legal_fees:
    "Our fee for acting on your purchase, including reviewing the agreement, searching title, preparing the closing documents and attending to registration.",
  admin_fee:
    "Software, storage, banking, courier and administrative charges on your file.",
  hst: "HST applies to legal fees and to some disbursements. It is not charged on land transfer tax, government registration fees, or the title insurance premium.",
  property_tax_adjustment:
    "Your share of property tax and common expenses the seller has already paid for the period after closing. This is settled on the Statement of Adjustments, so it is not part of total closing costs — it is added to your balance separately.",
};

const Row: React.FC<{
  line: StatementLine;
  /** Grey inline note after the label, e.g. the HST rate. */
  note?: string;
  openKey: string | null;
  onToggle: (key: string) => void;
}> = ({ line, note, openKey, onToggle }) => {
  const label = LABEL_OVERRIDES[line.key] ?? line.label;
  const badge = line.badge ?? EXTRA_BADGES[line.key];
  const explanation = EXPLANATIONS[line.key];
  const isCredit = line.amount < 0;
  const open = openKey === line.key;

  return (
    <div className="py-2">
      <div className="flex items-start justify-between gap-3">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span
            className={`text-[13px] ${isCredit ? "text-gray-500" : "text-gray-700"}`}
          >
            {label}
          </span>
          {note && (
            <span className="text-[11px] text-gray-400">{note}</span>
          )}
          {badge && (
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide"
              style={{ backgroundColor: "#FEF2F2", color: BRAND }}
            >
              {badge}
            </span>
          )}
          {explanation && (
            <button
              type="button"
              onClick={() => onToggle(line.key)}
              aria-label={`What is ${label}?`}
              aria-expanded={open}
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
                open
                  ? "bg-[#FEF2F2] text-[#C10007]"
                  : "bg-gray-100 text-gray-400 hover:bg-gray-200"
              }`}
            >
              <Info size={10} strokeWidth={2.5} />
            </button>
          )}
        </span>
        <span
          className={`shrink-0 text-[13px] tabular-nums ${
            isCredit ? "text-gray-500" : "text-gray-800"
          }`}
        >
          {formatCurrency(line.amount)}
        </span>
      </div>
      {open && explanation && (
        <p className="mt-1.5 rounded-lg bg-gray-50 p-2.5 text-[11px] leading-relaxed text-gray-500">
          {explanation}
        </p>
      )}
    </div>
  );
};

const GroupTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4
    className="text-[10px] font-bold uppercase tracking-widest"
    style={{ color: BRAND }}
  >
    {children}
  </h4>
);

const ClosingCostBreakdown: React.FC<{ statement: Statement }> = ({
  statement,
}) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) =>
    setOpenKey((prev) => (prev === key ? null : key));

  // "HST @ 13% on taxable fees & disbursements" → "HST" + the grey note, so the
  // row reads like the others instead of running to two lines.
  const hstLabel = statement.hst.label;
  const hstNote = hstLabel.replace(/^HST\s*@?\s*/i, "");

  return (
    <div className="space-y-4">
      {statement.groups.map((group) => (
        <div key={group.key}>
          <GroupTitle>{group.title}</GroupTitle>
          <div className="mt-1 divide-y divide-gray-50">
            {group.lines.map((line) => (
              <Row
                key={line.key}
                line={line}
                openKey={openKey}
                onToggle={toggle}
              />
            ))}
          </div>
        </div>
      ))}

      {/* HST sits outside the groups — it is charged on only some of them. */}
      <div className="border-t border-dashed border-gray-200 pt-2">
        <Row
          line={{ key: "hst", label: "HST", amount: statement.hst.amount }}
          note={hstNote}
          openKey={openKey}
          onToggle={toggle}
        />
      </div>

      {/* A Statement of Adjustments item, so it is listed but deliberately NOT
          added into "Total closing costs" below. */}
      {statement.propertyTax && (
        <div>
          <GroupTitle>Adjustments</GroupTitle>
          <div className="mt-1">
            <Row
              line={statement.propertyTax}
              openKey={openKey}
              onToggle={toggle}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 border-t border-gray-300 pt-3">
        <span className="text-sm font-bold text-gray-900">
          Total closing costs
        </span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-gray-900">
          {formatCurrency(statement.total)}
        </span>
      </div>
    </div>
  );
};

export default ClosingCostBreakdown;
