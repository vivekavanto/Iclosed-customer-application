// v9 purchase/sale retainer wording (spec section 8, Appendix A). Pure.
import { getFirm, type FirmKey } from "@/lib/firms";
import { money } from "@/lib/closingEstimateEmail";
import { QUOTE_TEAM } from "@/lib/quotePricing";
import { computeFees, dollars, millions, type ExtraFee, type IclosedFees } from "@/lib/iclosedFees";

export type AgreementKind = "purchase" | "sale";

export interface RetainerAgreementInput {
  kind: AgreementKind;
  firmKey: FirmKey;
  property: string;
  /** Deal file number; null hides it. */
  fileNo: string | null;
  /** Positive dollars off the legal fee. */
  discount: number | null;
  /** YYYY-MM-DD signing date. */
  date: string;
}

export interface AgreementSection {
  label: string;
  body: string;
}

export interface FeeRow {
  label: string;
  amount: string;
}

/** Rendered agreement text for the page and PDF. */
export interface RetainerAgreement {
  title: string;
  /** Subtitle facts joined with " · ". */
  meta: string[];
  sections: AgreementSection[];
  fees: FeeRow[];
  feeNote: string;
  changesIntro: string;
  changes: FeeRow[];
  definitions: AgreementSection[];
  acceptance: string;
}

/** Purchase and sale leads get v9; others keep the FAQ. */
export function retainerAgreementKind(leadType: string | null | undefined): AgreementKind | null {
  const lt = (leadType ?? "").trim();
  if (lt === "Purchase") return "purchase";
  if (lt === "Sale") return "sale";
  return null;
}

/** "29 September 2026" from YYYY-MM-DD. */
export function longDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// "($100.00)" for a discount, "$0.00" when none.
function bracketed(n: number): string {
  return n > 0 ? `(${money(n)})` : money(0);
}

const ADVICE: AgreementSection = {
  label: "Independent legal advice.",
  body: "We act for everyone on your file together. If one person's interests differ from the rest, they may need their own lawyer for independent legal advice. We will tell you and this usually costs $250 to $450.",
};

const DEF = {
  title: {
    label: "Title Insurance.",
    body: "A one-time policy that protects the owner and the lender against losses from title fraud, defects in title and similar problems unknown at closing.",
  },
  lender: {
    label: "B Lender or Private Lender.",
    body: "A lender outside the major banks, such as a trust company, mortgage investment corporation or private individual, whose mortgages usually need extra documents and review.",
  },
  noar: {
    label: "Notice of Assignment of Rents.",
    body: "A document some lenders require on a rented property, giving the lender the right to collect the rent if the mortgage goes into default.",
  },
  instructions: {
    label: "Mortgage Instructions.",
    body: "Your lender's written directions to us setting out the mortgage terms, their conditions and the documents they need before they release your funds.",
  },
} satisfies Record<string, AgreementSection>;

// "If this happens" labels per extras key (spec A4).
const EXTRA_LABELS: Record<string, (e: ExtraFee) => Partial<Record<AgreementKind, string>>> = {
  closing_date_moved: () => ({
    purchase: "If you require the closing date to be moved",
    sale: "If you require the closing date to be moved",
  }),
  late_mortgage_instructions: (e) => ({
    purchase: `Mortgage instructions arrive under ${e.threshold_business_days} business days of closing`,
  }),
  extra_payout: () => ({
    purchase: "Each payout beyond the one in your fee",
    sale: "Each payout beyond first mortgage, property tax and commission",
  }),
  notice_of_assignment_of_rents: (e) => ({
    purchase: `Notice of Assignment of Rents required (${dollars(e.registration ?? 0)} is paid to the ministry)`,
  }),
  bridge_financing: () => ({ purchase: "Bridge financing" }),
  b_or_private_lender: () => ({
    purchase: "Your mortgage is from a B Lender or Private Lender",
    sale: "Your mortgage is from a B Lender or Private Lender",
  }),
  price_tier: (e) => ({
    purchase: `Purchase price over ${millions(e.threshold ?? 0)}`,
    sale: `Sale price over ${millions(e.threshold ?? 0)}`,
  }),
  tax_certificate: () => ({ purchase: "Tax Certificate from the Municipality (paid to Municipality)" }),
};

function extraFeeText(key: string, e: ExtraFee): string {
  if (e.fee === "at_cost") return "At cost";
  const fee = dollars(e.fee);
  if (key === "notice_of_assignment_of_rents") return `${fee} plus ${dollars(e.registration ?? 0)} registration`;
  if (key === "price_tier") return `${fee}, or quoted above ${millions(e.manual_quote_above ?? 0)}`;
  if (e.approximate) return `Approx ${fee}`;
  return e.unit && e.unit.startsWith("per ") ? `${fee} ${e.unit}` : fee;
}

const COPY: Record<
  AgreementKind,
  {
    title: string;
    legalFeeLabel: string;
    sections: AgreementSection[];
    feeNote: string;
    changesIntro: string;
    definitions: AgreementSection[];
    acceptance: string;
  }
> = {
  purchase: {
    title: "Purchase Retainer Agreement",
    legalFeeLabel: "Legal fees (for title transfer and mortgage)",
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
      ADVICE,
      {
        label: "Ending this retainer.",
        body: "Either of us can end this relationship in writing. We can stop acting if you do not pay, if a conflict comes up, or if you ask us to do something we cannot properly do. If it ends, or if your deal does not close, you pay the costs already incurred plus a fee for the work done. Ontario law governs this agreement.",
      },
    ],
    feeNote:
      "Land transfer tax and your title insurance premium are not included in these fees. They are paid to the government and to the insurer, not to us, and we bill them to you as they are incurred. Our fees come out of your closing funds, not in advance. Your draft statement of account itemises every disbursement.",
    changesIntro:
      "None of the items below apply today, and we will tell you in writing before charging any of them. Work nobody can predict at this stage, such as private or B lender mortgages, estates, corporate parties, title defects, non-resident parties and builder or assignment deals, is quoted in writing and agreed before we do it.",
    definitions: [DEF.title, DEF.lender, DEF.noar, DEF.instructions],
    acceptance:
      "By signing you agree to these terms and the fees above, you understand that in most cases we also act for your lender, you instruct us to obtain title insurance, and you understand we use AI-assisted tools with lawyer oversight.",
  },
  sale: {
    title: "Sale Retainer Agreement",
    legalFeeLabel: "Legal fees (including first mortgage, property tax and commission payout)",
    sections: [
      {
        label: "What we do.",
        body: "We prepare your transfer and your statement of adjustments, respond to the buyer's requisitions, pay off your mortgage and arrange its discharge from title, hold and release your funds in trust, close, and send you your proceeds.",
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
        body: "Confidential. Shared only with your lender, the buyer's lawyer, the land registry and your brokerage. Send anything sensitive through your portal. We keep your file for the period the Law Society requires, then destroy it securely.",
      },
      ADVICE,
      {
        label: "Ending this retainer.",
        body: "Either of us can end it in writing. We can stop acting if you do not pay, if a conflict comes up, or if you ask us to do something we cannot properly do. If it ends, or if your deal does not close, you pay the costs already incurred plus a fee for the work done. Ontario law governs this agreement.",
      },
    ],
    feeNote:
      "There is no land transfer tax on a sale, and you do not buy title insurance. Our fees come out of your sale proceeds, not in advance. Your draft statement of account itemises every disbursement.",
    changesIntro:
      "None of these apply today, and we will tell you in writing before charging any of them. Work nobody can predict at this stage, such as private or B lender mortgages, estates, corporate parties, title defects, non-resident parties and builder or assignment deals, is quoted in writing and agreed before we do it.",
    definitions: [DEF.lender],
    acceptance:
      "By signing you agree to these terms and the fees above, and you understand we use AI-assisted tools with lawyer oversight.",
  },
};

export function buildRetainerAgreement(fees: IclosedFees, input: RetainerAgreementInput): RetainerAgreement {
  const { kind } = input;
  const copy = COPY[kind];
  const ft = fees.file_types[kind];
  const f = computeFees(fees, kind, { discount: input.discount });
  const { lawyer, csm } = QUOTE_TEAM;

  const range = ft.disbursements_range;
  const disbursementsLabel =
    kind === "purchase" && range
      ? `Estimated Disbursements (average is ${dollars(range[0])}-${dollars(range[1])})`
      : ft.disbursements_label;

  const changes: FeeRow[] = Object.entries(fees.extras).flatMap(([key, e]) => {
    const label = e.applies_to.includes(kind) ? EXTRA_LABELS[key]?.(e)[kind] : undefined;
    return label ? [{ label, amount: extraFeeText(key, e) }] : [];
  });

  const hstNumber = fees.retainer?.hst_registration_number || "[number]";

  return {
    title: copy.title,
    meta: [input.property, input.fileNo ? `File ${input.fileNo}` : "", longDate(input.date), getFirm(input.firmKey).introName].filter(Boolean),
    sections: [
      {
        label: "Your lawyer.",
        body: `${lawyer.name}, licensed in Ontario, Law Society number ${lawyer.lsoNumber}, is responsible for your file. ${csm.fullName}, your Customer Success Manager, is your day to day contact. A law clerk prepares your documents, under your lawyer's supervision.`,
      },
      ...copy.sections,
    ],
    fees: [
      { label: copy.legalFeeLabel, amount: money(f.legalFees) },
      { label: "Discount", amount: bracketed(f.discount) },
      { label: disbursementsLabel, amount: money(f.disbursements) },
      { label: "HST", amount: money(f.hst) },
    ],
    feeNote: `${copy.feeNote} HST registration ${hstNumber}.`,
    changesIntro: copy.changesIntro,
    changes,
    definitions: copy.definitions,
    acceptance: copy.acceptance,
  };
}
