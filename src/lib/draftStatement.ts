// v4 purchase draft statement (spec 9), shared by modal and PDF.
import { money } from "@/lib/closingEstimateEmail";
import { provincialLTT, round2, type Tier } from "@/lib/closingCosts";
import { computeFees, dollars, type IclosedFees, type LttBracket } from "@/lib/iclosedFees";
import { EXPLANATIONS } from "@/lib/closingCostExplanations";

export interface PurchaseDraftInput {
  name: string | null;
  property: string | null;
  /** YYYY-MM-DD. */
  closingDate: string | null;
  price: number;
  /** null counts as $0. */
  deposit: number | null;
  /** Signed: positive is a charge, negative a credit; null unknown. */
  propertyTaxAdjustment: number | null;
  /** Unanswered counts as $0; an answered 0 is a cash purchase. */
  mortgage: number | null;
  isToronto: boolean;
  firstTimeBuyer: boolean;
  /** The firm's FCT quote once known; null uses the fee-file estimate. */
  titlePremium: number | null;
  discount: number | null;
}

/** File inputs; the client adds mortgage and first-time buyer. */
export type DraftFileInput = Omit<PurchaseDraftInput, "mortgage" | "firstTimeBuyer">;

export interface DraftLine {
  label: string;
  /** Printed on the PDF and shown behind the info icon. */
  note?: string;
  /** Info-icon text on screen only. */
  tip?: string;
  amount: string;
  total?: boolean;
}

export interface DraftSection {
  title: string;
  lines: DraftLine[];
  note?: string;
}

export interface DraftStatement {
  title: string;
  details: { label: string; value: string }[];
  sections: DraftSection[];
  /** Headline figure; null only when the property tax adjustment is unknown. */
  fundsRequired: number | null;
  /** Legal fees, disbursements and HST. */
  feesTotal: number;
  landTransferTax: number;
  titleInsurance: number;
  /** Fees, land transfer tax and title insurance together. */
  closingCostsTotal: number;
}

const UNKNOWN = "[Amount]";

// "($4,000.00)" for amounts taken off.
function less(n: number | null): string {
  return `(${n === null ? UNKNOWN : money(n)})`;
}

function amount(n: number | null): string {
  return n === null ? UNKNOWN : n < 0 ? less(-n) : money(n);
}

function longDate(iso: string | null): string {
  if (!iso) return "[Date]";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// Marginal tax for any bracket set.
const bracketTax = (price: number, brackets: LttBracket[]) =>
  round2(provincialLTT(price, brackets.map((b): Tier => [b.up_to, b.rate])));

/** Ontario and Toronto land transfer tax with rebates and fee (spec 5.5). */
export function landTransferTax(fees: IclosedFees, price: number, isToronto: boolean, firstTimeBuyer: boolean) {
  const { ontario, toronto } = fees.land_transfer_tax;
  const ontarioTax = bracketTax(price, ontario.brackets);
  const ontarioRebate = firstTimeBuyer ? round2(Math.min(ontarioTax, ontario.first_time_buyer_rebate_max)) : 0;
  const torontoTax = isToronto ? bracketTax(price, toronto.brackets) : 0;
  const torontoRebate =
    isToronto && firstTimeBuyer ? round2(Math.min(torontoTax, toronto.first_time_buyer_rebate_max)) : 0;
  const adminFee = isToronto ? round2(toronto.administration_fee ?? 0) : 0;
  const total = round2(ontarioTax - ontarioRebate + torontoTax - torontoRebate + adminFee);
  return { ontarioTax, ontarioRebate, torontoTax, torontoRebate, adminFee, total };
}

// Disbursement labels and notes (spec Appendix A6), by fee-file key.
function disbursementCopy(fees: IclosedFees, key: string): { label: string; note: string } | null {
  const lines = fees.file_types.purchase.disbursements;
  const range = lines.searches?.range;
  switch (key) {
    case "registration_of_transfer":
      return { label: "Registration of transfer", note: "Government fee to register you as the new owner. One per purchase." };
    case "registration_of_charge":
      return {
        label: "Registration of charge",
        note: `Government fee to register your mortgage on the property. ${dollars(lines.registration_of_charge.amount)} for each charge registered.`,
      };
    case "searches":
      return {
        label: "Searches",
        note: `Fee to search the property title and to search for court judgments registered against everyone on the deal. Run before closing and again on the day of closing.${range ? ` (Average is ${dollars(range[0])}-${dollars(range[1])})` : ""}`,
      };
    case "software":
      return {
        label: "Software and document preparation",
        note: "The conveyancing, title insurance, search and e-signing platforms that are used for your closing.",
      };
    case "file_administration":
      return {
        label: "File administration",
        note: "Secure document storage, certified funds, bank drafts, courier, and the electronic transfer of your closing funds.",
      };
    default:
      return null;
  }
}

// Item descriptions from the v4 template (spec Appendix A6).
const LTT_NOTE =
  "This is a government tax, not a fee we set. Ontario charges it everywhere in the province. The City of Toronto charges its own Land Transfer Tax on top for properties located in Toronto. We claim both first-time buyer rebates on your behalf so you pay the reduced amount and do not apply for anything afterwards.";
const TITLE_NOTE =
  "A one-time premium, set by the insurer, based on your price and property type. It covers title fraud, defects and survey issues for as long as you own the home. Obtaining Title Insurance is a requirement imposed by your lender. Reviewing the policy and submitting it is included in our legal fees. We do not charge separately for it.";
const DISBURSEMENTS_NOTE =
  "Registry and search lines are shown tax included. We pass them through at cost and do not mark them up. We do not charge for photocopies, printing, postage, phone calls, emails or meetings.";
const FUNDS_NOTE = "We will confirm this figure in writing at least five business days before closing, once the final statement of adjustments is in.";

export function buildPurchaseDraft(fees: IclosedFees, input: PurchaseDraftInput): DraftStatement {
  const ft = fees.file_types.purchase;
  const hasMortgage = input.mortgage === null ? undefined : input.mortgage > 0;
  const f = computeFees(fees, "purchase", { hasMortgage, discount: input.discount });
  const ltt = landTransferTax(fees, input.price, input.isToronto, input.firstTimeBuyer);
  const title = round2(input.titlePremium ?? ft.title_insurance_estimate ?? 0);

  const deposit = input.deposit ?? 0;
  const mortgage = input.mortgage ?? 0;
  const balanceDue =
    input.propertyTaxAdjustment === null ? null : round2(input.price - deposit + input.propertyTaxAdjustment);
  const fundsRequired =
    balanceDue === null ? null : round2(balanceDue - mortgage + f.total + ltt.total + title);

  const lttLines: DraftLine[] = [
    { label: "Ontario land transfer tax", amount: money(ltt.ontarioTax), tip: EXPLANATIONS.ltt_provincial },
  ];
  if (input.firstTimeBuyer)
    lttLines.push({ label: "Less Ontario first-time buyer rebate", amount: less(ltt.ontarioRebate), tip: EXPLANATIONS.rebate_ontario });
  if (input.isToronto) {
    lttLines.push({ label: "Toronto land transfer tax", amount: money(ltt.torontoTax), tip: EXPLANATIONS.ltt_municipal });
    if (input.firstTimeBuyer)
      lttLines.push({ label: "Less Toronto first-time buyer rebate", amount: less(ltt.torontoRebate), tip: EXPLANATIONS.rebate_toronto });
    lttLines.push({ label: "Toronto land transfer tax administration fee", amount: money(ltt.adminFee) });
  }
  lttLines.push({ label: "Land transfer tax", amount: money(ltt.total), total: true, note: LTT_NOTE });

  const disbLines: DraftLine[] = f.disbursementLines.flatMap((l) => {
    const copy = disbursementCopy(fees, l.key);
    if (!copy) return [];
    return [{ ...copy, amount: `${l.estimate ? "approx. " : ""}${money(l.amount)}` }];
  });
  disbLines.push({ label: "Estimated total disbursements", amount: money(f.disbursements), total: true, note: DISBURSEMENTS_NOTE });

  return {
    title: "Purchase Draft Statement of Account",
    details: [
      { label: "Name", value: input.name || "[Name]" },
      { label: "Property", value: input.property || "[Address]" },
      { label: "Closing date", value: longDate(input.closingDate) },
      { label: "Purchase price", value: money(input.price) },
    ],
    sections: [
      {
        title: "Estimated statement of adjustments",
        lines: [
          { label: "Purchase price", amount: money(input.price) },
          { label: "Less deposit", amount: less(deposit) },
          { label: "Property tax adjustment", amount: amount(input.propertyTaxAdjustment), tip: EXPLANATIONS.property_tax_adjustment },
          { label: "Estimated balance due on closing", amount: amount(balanceDue), total: true },
        ],
      },
      {
        title: "Land transfer tax",
        lines: lttLines,
      },
      {
        title: "Title insurance",
        lines: [{ label: "FCT policy premium, estimate", amount: money(title), note: TITLE_NOTE }],
      },
      {
        title: "Legal fees",
        lines: [
          { label: "Purchase, for title transfer and mortgage", amount: money(f.legalFees), tip: EXPLANATIONS.legal_fees },
          { label: "Discount", amount: f.discount > 0 ? less(f.discount) : money(0) },
        ],
      },
      {
        title: "Estimated disbursements",
        lines: disbLines,
      },
      {
        title: "HST",
        lines: [
          {
            label: `HST at ${Math.round(fees.tax.hst_rate * 100)}% on our legal fees and our own disbursements`,
            amount: money(f.hst),
            tip: EXPLANATIONS.hst,
          },
        ],
      },
      {
        title: "Funds you need on closing",
        lines: [
          { label: "Estimated balance due per statement of adjustments", amount: amount(balanceDue) },
          { label: "Less mortgage advance", amount: less(mortgage) },
          { label: "Legal fees, disbursements and HST", amount: money(f.total) },
          { label: "Land transfer tax", amount: money(ltt.total) },
          { label: "Title insurance", amount: money(title) },
          { label: "Funds required from you", amount: amount(fundsRequired), total: true, note: FUNDS_NOTE },
        ],
      },
    ],
    fundsRequired,
    feesTotal: f.total,
    landTransferTax: ltt.total,
    titleInsurance: title,
    closingCostsTotal: round2(f.total + ltt.total + title),
  };
}

/** "iClosed Draft Statement of Account 26P-0411 424 Calderstone Crescent.pdf" */
export function draftStatementPdfFileName(fileNo?: string | null, propertyAddress?: string | null): string {
  const street = (propertyAddress ?? "").split(",")[0];
  const parts = ["iClosed Draft Statement of Account", fileNo ?? "", street]
    .map((p) => p.trim().replace(/[\\/:*?"<>|]+/g, ""))
    .filter(Boolean)
    .join(" ");
  return `${parts.slice(0, 180).trim()}.pdf`;
}
