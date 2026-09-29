// v7 purchase/sale retainer wording, shared by page and PDF.
import { getFirm, type FirmKey } from "@/lib/firms";
import { money } from "@/lib/closingEstimateEmail";
import { QUOTE_TEAM } from "@/lib/quotePricing";
import { round2 } from "@/lib/closingCosts";

export type AgreementKind = "purchase" | "sale";

/** Figures and file facts the server supplies for one retainer. */
export interface RetainerAgreementData {
  kind: AgreementKind;
  firmKey: FirmKey;
  property: string;
  /** Deal file number; null hides it. */
  fileNo: string | null;
  legalFees: number;
  /** Positive amount off the legal fee; null or 0 hides the row. */
  discount: number | null;
  disbursements: number;
  /** HST-taxable part of `disbursements`. */
  taxableDisbursements: number;
  hstRate: number;
  hstNumber: string | null;
}

export interface AgreementSection {
  label: string;
  body: string;
}

export interface FeeRow {
  label: string;
  amount: string;
}

export interface RetainerAgreement {
  title: string;
  /** Header facts joined with " · ". */
  meta: string[];
  sections: AgreementSection[];
  fees: FeeRow[];
  feeNote: string;
  changesIntro: string;
  changes: FeeRow[];
  definitions: AgreementSection[];
  acceptance: string;
}

/** Single-side purchase and sale leads get the v7 agreement; others keep the FAQ. */
export function retainerAgreementKind(leadType: string | null | undefined): AgreementKind | null {
  const lt = (leadType ?? "").trim();
  if (lt === "Purchase") return "purchase";
  if (lt === "Sale") return "sale";
  return null;
}

/** HST on the firm's taxable fees, after any discount. */
export function retainerAgreementHst(d: RetainerAgreementData): number {
  const discount = d.discount && d.discount > 0 ? d.discount : 0;
  return round2(d.hstRate * Math.max(0, d.legalFees - discount + d.taxableDisbursements));
}

/** "29 September 2026" from YYYY-MM-DD. */
export function longDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const INDEPENDENT_ADVICE: AgreementSection = {
  label: "Independent legal advice.",
  body: "We act for everyone on your file together. If one person's interests differ from the rest, they may need their own lawyer for independent legal advice. We will tell you and this usually costs $250 to $450.",
};

const DEFINITIONS: AgreementSection[] = [
  {
    label: "Title Insurance.",
    body: "A one-time policy that protects the owner and the lender against losses from title fraud, defects in title and similar problems unknown at closing.",
  },
  {
    label: "B Lender or Private Lender.",
    body: "A lender outside the major banks and credit unions, such as a trust company, mortgage investment corporation or private individual, whose mortgages usually need extra documents and review.",
  },
  {
    label: "Notice of Assignment of Rents.",
    body: "A document some lenders require on a rented property, giving the lender the right to collect the rent if the mortgage goes into default.",
  },
  {
    label: "Mortgage Instructions.",
    body: "Your lender's written directions to us setting out the mortgage terms, their conditions and the documents they need before they release your funds.",
  },
];

// Wording that differs between the purchase and sale agreements.
const COPY: Record<
  AgreementKind,
  {
    label: string;
    legalFeeLabel: string;
    disbursementsLabel: string;
    sections: AgreementSection[];
    feeNote: string;
    changesIntro: string;
    changes: FeeRow[];
    acceptance: string;
  }
> = {
  purchase: {
    label: "Purchase",
    legalFeeLabel: "Legal fees (for title transfer and mortgage)",
    disbursementsLabel: "Estimated Disbursements (average is $650-$750)",
    sections: [
      {
        label: "What we do.",
        body: "We search title, prepare and register your closing documents, arrange your title insurance, hold and release your funds in trust, close, and report to you. In most cases, we also act for your lender on the mortgage, which is how one firm closes your deal, and we share what they need to know about it with them.",
      },
      {
        label: "What we do not do.",
        body: "We do not advise on the price, the condition of the property, zoning, open permits, your mortgage terms, tax including HST, GST and the non-resident speculation tax, or environmental matters.",
      },
      {
        label: "What we need from you.",
        body: "Two pieces of identification for each buyer, and we cannot act for you until we verify who you are. Your signed agreement and intake form. Mortgage instructions at least three business days before closing. Home insurance with your lender named on it.",
      },
      {
        label: "Technology and AI.",
        body: "We run your closing on secure paid software, some of it AI-assisted, used by enterprise institutions including banks. Your information is not used to train anyone's systems, we do not use free or consumer AI services, and a human reviews everything. AI does not decide anything on your file.",
      },
      {
        label: "Your information.",
        body: "Confidential. Shared only with your lender, the title insurer, the land registry office and your brokerage. Send anything sensitive through your portal. We keep your file for the period the Law Society requires, then destroy it securely.",
      },
      INDEPENDENT_ADVICE,
      {
        label: "Ending this retainer.",
        body: "Either of us can end this relationship in writing. We can stop acting if you do not pay, if a conflict comes up, or if you ask us to do something we cannot properly do. If it ends, or if your deal does not close, you pay the costs already incurred plus a fee for the work done. Ontario law governs this agreement.",
      },
    ],
    feeNote:
      "Land transfer tax and your title insurance premium are not included in these fees. They are paid to the government and to the insurer, not to us, and we bill them to you as they are incurred. Our fees come out of your closing funds, not in advance. Your draft statement of account itemises every disbursement.",
    changesIntro:
      "None of the items below apply today, and we will tell you in writing before charging any of them. Work nobody can predict at this stage, such as private or B lender mortgages, estates, corporate parties, title defects, non-resident parties and builder or assignment deals, is quoted in writing and agreed before we do it.",
    changes: [
      { label: "If you require the closing date to be moved", amount: "$250 per extension request" },
      { label: "Mortgage instructions arrive under 3 business days of closing", amount: "$200" },
      { label: "Each payout beyond the one in your fee", amount: "$100" },
      { label: "Notice of Assignment of Rents required ($85 is paid to the ministry)", amount: "$150 plus $85 registration" },
      { label: "Bridge financing", amount: "$200" },
      { label: "Your mortgage is from a B Lender or Private Lender", amount: "$250" },
      { label: "Purchase price over $1.5M", amount: "$300, or quoted above $3M" },
      { label: "Tax Certificate from the Municipality (paid to Municipality)", amount: "Approx $100" },
    ],
    acceptance:
      "By signing you agree to these terms and the fees above, you understand that in most cases we also act for your lender, you instruct us to obtain title insurance, and you understand we use AI-assisted tools with lawyer oversight.",
  },
  sale: {
    label: "Sale",
    legalFeeLabel: "Legal fees (including first mortgage, property tax and commission payout)",
    disbursementsLabel: "Disbursements",
    sections: [
      {
        label: "What we do.",
        body: "We prepare your transfer and your statement of adjustments, respond to the buyer's requisitions, pay off your mortgage and discharge it from title, hold and release your funds in trust, close, and send you your proceeds.",
      },
      {
        label: "What we do not do.",
        body: "We do not advise on the price, the condition of the property, zoning, tax including HST and GST, or environmental matters.",
      },
      {
        label: "What we need from you.",
        body: "Two pieces of identification for each seller, and we cannot act until we verify who you are. Your signed agreement and intake form. Your most recent mortgage statement and property tax bill, a void cheque for your proceeds, and details of any rental equipment. Do not cancel your home insurance or hot water tank until closing is done.",
      },
      {
        label: "Technology and AI.",
        body: "We run your closing on secure paid software, some of it AI-assisted, used by enterprises including banks. Your information is not used to train anyone's systems, we do not use free or consumer AI services, and a human reviews everything. AI does not decide anything on your file.",
      },
      {
        label: "Your information.",
        body: "Confidential. Shared only with your lender, the title insurer, the land registry and your brokerage. Send anything sensitive through your portal. We keep your file for the period the Law Society requires, then destroy it securely.",
      },
      INDEPENDENT_ADVICE,
      {
        label: "Ending this retainer.",
        body: "Either of us can end it in writing. We can stop acting if you do not pay, if a conflict comes up, or if you ask us to do something we cannot properly do. If it ends, or if your deal does not close, you pay the costs already incurred plus a fee for the work done. Ontario law governs this agreement.",
      },
    ],
    feeNote:
      "There is no land transfer tax on a sale, and you do not buy title insurance. Our fees come out of your sale proceeds, not in advance. Your draft statement of account itemises every disbursement.",
    changesIntro:
      "None of these apply today, and we will tell you in writing before charging any of them. Work nobody can predict at this stage, such as private or B lender mortgages, estates, corporate parties, title defects, non-resident parties and builder or assignment deals, is quoted in writing and agreed before we do it.",
    changes: [
      { label: "If you require the closing date to be moved", amount: "$250 per extension request" },
      { label: "Each payout beyond first mortgage, property tax and commission", amount: "$100" },
      { label: "Notice of Assignment of Rents required ($85 is paid to the ministry)", amount: "$150 plus $85 registration" },
      { label: "Your mortgage is from a B Lender or Private Lender", amount: "$250" },
      { label: "Sale price over $1.5M", amount: "$300, or quoted above $3M" },
    ],
    acceptance:
      "By signing you agree to these terms and the fees above, and you understand we use AI-assisted tools with lawyer oversight.",
  },
};

export function buildRetainerAgreement(
  d: RetainerAgreementData,
  /** YYYY-MM-DD, the signing date. */
  date: string,
): RetainerAgreement {
  const copy = COPY[d.kind];
  const firm = getFirm(d.firmKey);
  const entity = firm.key === "navawilson" ? `${firm.legalName}, operating as iClosed` : firm.legalName;
  const { lawyer, csm } = QUOTE_TEAM;
  const hasDiscount = Boolean(d.discount && d.discount > 0);

  const fees: FeeRow[] = [{ label: copy.legalFeeLabel, amount: money(d.legalFees) }];
  if (hasDiscount) fees.push({ label: "Discount", amount: `-${money(d.discount as number)}` });
  fees.push(
    { label: copy.disbursementsLabel, amount: money(d.disbursements) },
    { label: "HST", amount: money(retainerAgreementHst(d)) },
  );

  const hstReg = d.hstNumber ? ` HST registration ${d.hstNumber}.` : "";

  return {
    title: `${copy.label} Retainer Agreement`,
    meta: [copy.label, d.property, d.fileNo ? `File ${d.fileNo}` : "", longDate(date), entity].filter(Boolean),
    sections: [
      {
        label: "Your lawyer.",
        body: `${lawyer.name}, licensed in Ontario, Law Society number ${lawyer.lsoNumber}, is responsible for your file. ${csm.fullName}, your Customer Success Manager, is your day to day contact. A law clerk prepares your documents, under your lawyer's supervision.`,
      },
      ...copy.sections,
    ],
    fees,
    feeNote: `${copy.feeNote}${hstReg}`,
    changesIntro: copy.changesIntro,
    changes: copy.changes,
    definitions: DEFINITIONS,
    acceptance: copy.acceptance,
  };
}
