// v6 purchase and refinance draft statements (spec 9).
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
  /** Screen-only overrides; the PDF ignores them. */
  screen?: { label?: string; amount?: string; estimate?: boolean; hidden?: boolean };
}

export interface DraftSection {
  title: string;
  lines: DraftLine[];
  note?: string;
  /** Caption under the section on screen only. */
  screenNote?: string;
}

/** What the sections view and PDF render. */
export interface DraftDocument {
  title: string;
  details: { label: string; value: string }[];
  sections: DraftSection[];
  /** Closing paragraph; refinance only for now. */
  disclaimer?: string;
}

export interface DraftStatement extends DraftDocument {
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
function disbursementCopy(
  fees: IclosedFees,
  type: "purchase" | "refinance",
  key: string,
): { label: string; note?: string } | null {
  const lines = fees.file_types[type].disbursements;
  const range = lines.searches?.range;
  const avg = range ? ` (${type === "refinance" ? "Average is" : "Average range is"} ${dollars(range[0])}-${dollars(range[1])})` : "";
  if (type === "refinance") {
    switch (key) {
      case "registration_of_charge":
        return { label: "Registration of charge", note: "Government fee to register your new mortgage on the property." };
      case "searches":
        return {
          label: "Searches",
          note: `Fee to search the property title and to search for court judgments registered against you. Run before closing and again on the day of closing.${avg}`,
        };
      case "software":
        return { label: "Software and document preparation" };
      case "file_administration":
        return {
          label: "File administration",
          note: "Secure document storage, certified funds, bank drafts, courier, the electronic transfer of your funds, and the platform your payout runs through.",
        };
      case "discharge_registration":
        return { label: "Registration of discharge" };
      default:
        return null;
    }
  }
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
        note: `Fee to search the property title and to search for court judgments registered against everyone on the deal. Run before closing and again on the day of closing.${avg}`,
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

// Item descriptions from the v6 template (spec Appendix A6).
const LTT_NOTE =
  "This is a government tax, not a fee we set. Ontario charges it everywhere in the province. The City of Toronto charges its own Land Transfer Tax on top for properties located in Toronto. We claim both first-time buyer rebates on your behalf so you pay the reduced amount and do not apply for anything afterwards.";
const TITLE_NOTE =
  "A one-time premium, set by the insurer, based on your price and property type. It covers title fraud, defects and survey issues for as long as you own the home. Obtaining Title Insurance is a requirement imposed by your lender.";
const DISBURSEMENTS_NOTE =
  "Registry and search lines are shown tax included. We pass them through at cost and do not mark them up. We do not charge for photocopies, printing, postage, phone calls, emails or meetings.";
// Shorter screen captions for the modal.
const LTT_SCREEN_NOTE =
  "A government tax, not our fee. Toronto adds its own tax on top of Ontario's. We claim any first-time buyer rebates for you.";
const LTT_SCREEN_NOTE_ONTARIO = "A government tax, not our fee. We claim any first-time buyer rebate for you.";
const LTT_ADMIN_TIP = "The City of Toronto's fee for processing its land transfer tax, charged through the land registry.";
const TITLE_SCREEN_NOTE = "Required by your lender. One-time premium, based on your price and property type.";
const DISBURSEMENTS_SCREEN_NOTE =
  "Registry and search lines are shown tax included. We pass them through at cost and do not mark them up.";
const FUNDS_NOTE = "We will confirm this figure in writing before closing, once the final statement of adjustments is in.";

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
    { label: "Ontario land transfer tax", amount: money(ltt.ontarioTax) },
  ];
  if (input.firstTimeBuyer)
    lttLines.push({ label: "Less Ontario first-time buyer rebate", amount: less(ltt.ontarioRebate), tip: EXPLANATIONS.rebate_ontario });
  if (input.isToronto) {
    lttLines.push({ label: "Toronto land transfer tax", amount: money(ltt.torontoTax), tip: EXPLANATIONS.ltt_municipal });
    if (input.firstTimeBuyer)
      lttLines.push({ label: "Less Toronto first-time buyer rebate", amount: less(ltt.torontoRebate), tip: EXPLANATIONS.rebate_toronto });
    lttLines.push({ label: "Toronto land transfer tax administration fee", amount: money(ltt.adminFee), tip: LTT_ADMIN_TIP });
  }
  lttLines.push({
    label: "Land transfer tax",
    amount: money(ltt.total),
    total: true,
    note: LTT_NOTE,
    screen: { label: "Total land transfer tax" },
  });

  const disbLines: DraftLine[] = f.disbursementLines.flatMap((l) => {
    const copy = disbursementCopy(fees, "purchase", l.key);
    if (!copy) return [];
    return [
      {
        ...copy,
        amount: `${l.estimate ? "approx. " : ""}${money(l.amount)}`,
        screen: l.estimate ? { amount: money(l.amount), estimate: true } : undefined,
      },
    ];
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
          {
            label: "Property tax adjustment",
            amount: amount(input.propertyTaxAdjustment),
            tip: EXPLANATIONS.property_tax_adjustment,
            screen: { estimate: true },
          },
          { label: "Estimated balance due on closing", amount: amount(balanceDue), total: true },
        ],
      },
      {
        title: "Land transfer tax",
        lines: lttLines,
        screenNote: input.isToronto ? LTT_SCREEN_NOTE : LTT_SCREEN_NOTE_ONTARIO,
      },
      {
        title: "Title insurance",
        lines: [{ label: "FCT policy premium, estimate", amount: money(title), note: TITLE_NOTE, screen: { estimate: true } }],
        screenNote: TITLE_SCREEN_NOTE,
      },
      {
        title: "Legal fees",
        lines: [
          {
            label: "Purchase legal fees",
            amount: money(f.legalFees),
            tip: EXPLANATIONS.legal_fees,
            screen: { label: hasMortgage === false ? "Purchase, for title transfer" : "Purchase, for title transfer and mortgage" },
          },
          { label: "Discount", amount: f.discount > 0 ? less(f.discount) : money(0), screen: { hidden: f.discount <= 0 } },
        ],
      },
      {
        title: "Estimated disbursements",
        lines: disbLines,
        screenNote: DISBURSEMENTS_SCREEN_NOTE,
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
          { label: "Land transfer tax", amount: money(ltt.total), screen: { label: "Total land transfer tax" } },
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

export interface RefinanceDraftInput {
  name: string | null;
  property: string | null;
  lender: string | null;
  /** YYYY-MM-DD. */
  closingDate: string | null;
  /** null until the lender's instructions arrive. */
  mortgageAdvance: number | null;
  /** null until the payout statement arrives. */
  existingPayout: number | null;
  /** The firm's FCT quote once known; null uses the fee-file estimate. */
  titlePremium: number | null;
  discount: number | null;
  chargesCount?: number;
  dischargeRegistration?: boolean;
}

export interface RefinanceDraft extends DraftDocument {
  /** null until the advance and payout are known. */
  fundsToYou: number | null;
  feesTotal: number;
  titleInsurance: number;
}

const REFI_TITLE_NOTE =
  "A one-time premium for your lender's policy, set by the insurer based on your mortgage amount. It protects your lender against title fraud and defects in title, and your lender requires it. Reviewing the policy and submitting it is included in our legal fees.";
const REFI_FUNDS_NOTE =
  "We close within two weeks after your lender sends instructions, or sooner if they arrive early.";
const DRAFT_DISCLAIMER =
  "This is a draft account, prepared from the information we have today. Government charges, title insurance premiums and statement of adjustments figures can move before closing. Your final account uses these same sections and these same line items.";

export function buildRefinanceDraft(fees: IclosedFees, input: RefinanceDraftInput): RefinanceDraft {
  const ft = fees.file_types.refinance;
  const f = computeFees(fees, "refinance", {
    discount: input.discount,
    chargesCount: input.chargesCount,
    dischargeRegistration: input.dischargeRegistration,
  });
  const title = round2(input.titlePremium ?? ft.title_insurance_estimate ?? 0);
  const fundsToYou =
    input.mortgageAdvance === null || input.existingPayout === null
      ? null
      : round2(input.mortgageAdvance - input.existingPayout - f.total - title);

  const disbLines: DraftLine[] = f.disbursementLines.flatMap((l) => {
    const copy = disbursementCopy(fees, "refinance", l.key);
    if (!copy) return [];
    return [{ ...copy, amount: `${l.estimate ? "approx. " : ""}${money(l.amount)}` }];
  });
  disbLines.push({ label: "Total Disbursements", amount: money(f.disbursements), total: true });

  return {
    title: "Refinance Draft Statement of Account",
    details: [
      { label: "Name", value: input.name || "[Name]" },
      { label: "Property", value: input.property || "[Address]" },
      { label: "New lender", value: input.lender || "[Lender]" },
      { label: "Closing date", value: longDate(input.closingDate) },
    ],
    sections: [
      {
        title: "Title insurance",
        lines: [{ label: "FCT lender policy premium, estimate", amount: money(title), note: REFI_TITLE_NOTE }],
      },
      {
        title: "Legal fees",
        lines: [
          { label: "Refinance, including first mortgage payout", amount: money(f.legalFees) },
          { label: "Discount", amount: f.discount > 0 ? less(f.discount) : money(0) },
        ],
      },
      { title: "Disbursements", lines: disbLines },
      {
        title: "HST",
        lines: [
          {
            label: `HST at ${Math.round(fees.tax.hst_rate * 100)}% on our legal fees and our own disbursements`,
            amount: money(f.hst),
          },
        ],
      },
      {
        title: "Your funds",
        lines: [
          { label: "New mortgage advance", amount: amount(input.mortgageAdvance) },
          { label: "Less payout of existing mortgage", amount: less(input.existingPayout) },
          { label: "Less legal fees, disbursements and HST", amount: less(f.total) },
          { label: "Less title insurance, estimate", amount: less(title) },
          { label: "Funds to you", amount: amount(fundsToYou), total: true, note: REFI_FUNDS_NOTE },
        ],
      },
    ],
    disclaimer: DRAFT_DISCLAIMER,
    fundsToYou,
    feesTotal: f.total,
    titleInsurance: title,
  };
}

export interface SaleDraftInput {
  name: string | null;
  property: string | null;
  /** YYYY-MM-DD. */
  closingDate: string | null;
  price: number;
  /** Deposit held by the listing brokerage; null counts as $0. */
  deposit: number | null;
  /** Percent, e.g. 5; null leaves the commission unknown. */
  commissionRate: number | null;
  /** Mortgage balance owing; null counts as $0. */
  mortgageBalance: number | null;
  discount: number | null;
}

/** File inputs; the client adds mortgage balance and commission rate. */
export type SaleFileInput = Omit<SaleDraftInput, "mortgageBalance" | "commissionRate">;

export interface SaleDraft extends DraftDocument {
  /** null only when the commission rate is unknown. */
  proceeds: number | null;
  /** Legal fees, disbursements and HST. */
  feesTotal: number;
}

// Sale copy from the v6 template.
const COMMISSION_NOTE =
  "Set by your listing agreement. Your brokerage usually takes it from the buyer's deposit and sends you any balance by cheque. If the deposit is less than the commission, we pay the difference to your brokerage from your proceeds.";
const SALE_DEPOSIT_TIP = "The buyer's deposit, held in trust by your listing brokerage until closing.";
const COMMISSION_BALANCE_TIP = "The commission and HST not covered by the deposit. We pay it to your brokerage from your proceeds.";
const LAWPRO_NOTE = "A levy that LAWPRO charges on every sale.";
const SALE_FILE_ADMIN_NOTE =
  "Secure document storage, certified funds, bank drafts, courier, the electronic transfer of your proceeds, and the platform your payouts run through.";
const SALE_FUNDS_NOTE = "Your proceeds go out within 1 business day of closing.";
const NO_TAX_ADJUSTMENT = "This estimate does not account for property tax adjustments.";

function saleDisbursementCopy(key: string): { label: string; note?: string } | null {
  switch (key) {
    case "lawpro_levy":
      return { label: "LAWPRO transaction levy", note: LAWPRO_NOTE };
    case "software":
      return { label: "Software and document preparation" };
    case "file_administration":
      return { label: "File administration", note: SALE_FILE_ADMIN_NOTE };
    case "seller_title_search":
      return { label: "Title search" };
    default:
      return null;
  }
}

// "5" or "4.5", for the commission label.
const pct = (n: number) => `${Number(n.toFixed(2))}%`;

export function buildSaleDraft(fees: IclosedFees, input: SaleDraftInput): SaleDraft {
  const f = computeFees(fees, "sale", { discount: input.discount });
  const hstRate = fees.tax.hst_rate;
  const deposit = input.deposit ?? 0;
  const mortgage = input.mortgageBalance ?? 0;

  const commission = input.commissionRate === null ? null : round2((input.price * input.commissionRate) / 100);
  const commissionHst = commission === null ? null : round2(commission * hstRate);
  // Brokerage keeps the deposit toward commission; we pay any shortfall.
  const commissionBalance =
    commission === null || commissionHst === null ? null : round2(Math.max(0, commission + commissionHst - deposit));
  const balanceReceived = commissionBalance === null ? null : round2(input.price - deposit - commissionBalance);
  const proceeds = balanceReceived === null ? null : round2(balanceReceived - mortgage - f.total);

  const commissionLabel =
    input.commissionRate === null
      ? "Real estate commission, paid from the deposit"
      : `Real estate commission (${pct(input.commissionRate)}), paid from the deposit`;

  const disbLines: DraftLine[] = f.disbursementLines.flatMap((l) => {
    const copy = saleDisbursementCopy(l.key);
    if (!copy) return [];
    return [
      {
        ...copy,
        amount: `${l.estimate ? "approx. " : ""}${money(l.amount)}`,
        screen: l.estimate ? { amount: money(l.amount), estimate: true } : undefined,
      },
    ];
  });
  disbLines.push({ label: "Estimated total disbursements", amount: money(f.disbursements), total: true });

  return {
    title: "Sale Draft Statement of Account",
    details: [
      { label: "Name", value: input.name || "[Name]" },
      { label: "Property", value: input.property || "[Address]" },
      { label: "Closing date", value: longDate(input.closingDate) },
      { label: "Sale price", value: money(input.price) },
    ],
    sections: [
      {
        title: "Sale price",
        lines: [
          { label: "Sale price", amount: money(input.price) },
          { label: "Less deposit held by your listing brokerage", amount: less(deposit), tip: SALE_DEPOSIT_TIP },
          {
            label: commissionLabel,
            // Bracketed as information on screen too; only the balance is deducted.
            amount: less(commission),
            note: COMMISSION_NOTE,
            screen: { amount: less(commission), estimate: true },
          },
          {
            label: `HST on commission (${pct(hstRate * 100)})`,
            amount: less(commissionHst),
            screen: { amount: less(commissionHst), estimate: true },
          },
          {
            label: "Less commission balance to your brokerage",
            amount: less(commissionBalance),
            tip: COMMISSION_BALANCE_TIP,
            screen: { hidden: commissionBalance === 0 },
          },
          { label: "Balance received from purchaser", amount: amount(balanceReceived), total: true },
        ],
      },
      {
        title: "Legal fees",
        lines: [
          { label: "Sale, including first mortgage, property tax and commission payout", amount: money(f.legalFees) },
          // Template: only when a discount is applied.
          ...(f.discount > 0 ? [{ label: "Discount", amount: less(f.discount) }] : []),
        ],
      },
      { title: "Estimated disbursements", lines: disbLines },
      {
        title: "HST",
        lines: [
          {
            label: `HST at ${Math.round(hstRate * 100)}% on our legal fees and our own disbursements`,
            amount: money(f.hst),
            tip: EXPLANATIONS.hst,
          },
        ],
      },
      {
        title: "Your proceeds",
        lines: [
          { label: "Balance received from purchaser", amount: amount(balanceReceived) },
          { label: "Less payout to lender", amount: less(mortgage), screen: { estimate: true } },
          { label: "Less legal fees, disbursements and HST", amount: less(f.total) },
          {
            label: "Proceeds to you",
            amount: amount(proceeds),
            total: true,
            note: `${SALE_FUNDS_NOTE} ${NO_TAX_ADJUSTMENT}`,
            screen: { label: "Proceeds to you from iClosed" },
          },
        ],
        screenNote: `${SALE_FUNDS_NOTE} ${NO_TAX_ADJUSTMENT}`,
      },
    ],
    proceeds,
    feesTotal: f.total,
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
