import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifyQuoteToken } from "@/lib/quoteToken";
import { loadLeadQuote, type LeadQuote } from "@/lib/leadQuote";
import { CONDO_FEES, QUOTE_LEGAL_FEES, QUOTE_TEAM } from "@/lib/quotePricing";
import { dollars } from "@/lib/iclosedFees";
import { loadIclosedFees } from "@/lib/loadIclosedFees";
import { money } from "@/lib/closingEstimateEmail";

// Reads leads with the service-role client; never cache or index.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your quote | iClosed",
  robots: { index: false, follow: false },
};

const TBD = "To be determined";

// "20 September 2026"; date-only values are read as calendar dates.
function formatDate(value: string | null): string | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : "America/Toronto",
  });
}

type Side = LeadQuote["side"];
type Line = { title: string; note: string; short?: string; amount: number | null };

const INTRO: Record<Side, string> = {
  buying: "your purchase",
  selling: "your sale",
  both: "your purchase and sale",
  refinance: "your refinance",
  condo: "your new condo with us, from occupancy to final closing",
};

const LEGAL_LINES: Record<Side, Line[]> = {
  buying: [
    {
      title: "Purchase, for title transfer and mortgage",
      note: "Flat fee. One property, one new mortgage.",
      amount: null,
    },
  ],
  selling: [
    {
      title: "Sale, including first mortgage, property tax and commission payout",
      note: "Includes your first mortgage, property tax and commission payouts. Any other payout is {extra_payout} plus HST.",
      amount: null,
    },
  ],
  both: [
    {
      title: "Purchase and sale, both closings",
      note: "Flat fee for both files, coordinated together.",
      amount: QUOTE_LEGAL_FEES.both,
    },
  ],
  refinance: [
    {
      title: "Refinance, including first mortgage payout",
      note: "Flat fee. Paying out your existing mortgage and registering the new one. Each further payout is $100 plus HST.",
      amount: QUOTE_LEGAL_FEES.refinance,
    },
  ],
  condo: [
    {
      title: "Occupancy closing",
      note: "When you move in, before the condo is registered.",
      amount: CONDO_FEES.occupancy,
    },
    {
      title: "Final closing, for title transfer and mortgage",
      note: "When the condo registers and the unit is transferred to you.",
      amount: CONDO_FEES.final,
    },
    {
      title: "Agreement review, optional",
      note: "Best done in your 10-day cooling-off period. $50 more if we write to the builder's lawyer. Not in the total above.",
      amount: CONDO_FEES.agreementReview,
    },
  ],
};

const TITLE_INSURANCE: Line = {
  title: "Title insurance premium",
  note: "Protects your ownership against title fraud, survey problems and defects in the title.",
  short: "Protects your ownership against title fraud, survey problems and defects.",
  amount: null,
};

// Third-party costs quoted as "To be determined".
const TBD_LINES: Record<Side, Line[]> = {
  buying: [
    TITLE_INSURANCE,
    {
      title: "Land transfer tax",
      note: "A government tax on the purchase. We claim your first-time buyer rebates at registration.",
      amount: null,
    },
  ],
  both: [],
  selling: [],
  refinance: [
    {
      title: "Lender title insurance premium",
      note: "Protects your lender against title fraud and defects in the title. Your lender requires it.",
      amount: null,
    },
  ],
  condo: [
    TITLE_INSURANCE,
    {
      title: "Land transfer tax",
      note: "Based on your price net of HST, plus certain builder adjustments. We claim your first-time buyer rebates.",
      amount: null,
    },
  ],
};
TBD_LINES.both = TBD_LINES.buying;

const DISBURSEMENT_TITLE: Partial<Record<Side, string>> = { selling: "Levy, software and file costs" };

const DISBURSEMENT_NOTE: Record<Side, string> = {
  buying: "Typical range is {range}. Itemised in full on your draft statement of account.",
  selling: "Itemised in full on your draft statement of account.",
  both: "Itemised in full on your draft statement of account.",
  refinance: "Itemised in full on your draft statement of account.",
  condo: "Charged at final closing. Itemised in full on your draft statement of account.",
};

const TRANSACTION: Record<Side, string> = {
  buying: "Purchase with one new mortgage",
  selling: "Sale with one mortgage payout",
  both: "Purchase and sale",
  refinance: "Refinance",
  condo: "New condo, occupancy and final closing",
};

// Condo quotes mention builder adjustments; sale has no title insurance.
const MOVING_FIGURES: Record<Side, string> = {
  buying: "title insurance premiums and statement of adjustments figures",
  selling: "statement of adjustments figures",
  both: "title insurance premiums and statement of adjustments figures",
  refinance: "title insurance premiums and statement of adjustments figures",
  condo: "title insurance premiums and builder adjustments",
};

const TITLE: Partial<Record<Side, string>> = { buying: "Your purchase quote", selling: "Your sale quote" };

const RED = "#B3211E";

// Row note: `short` replaces `note` on phones when given.
function Row({ title, note, short, amount }: { title: string; note: string; short?: string; amount: string }) {
  const tbd = amount === TBD;
  return (
    <div className="border-t border-gray-100 px-4 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-4 sm:gap-6">
        <div>
          <p className="text-[15px] font-medium text-gray-900">{title}</p>
          <p className="mt-0.5 hidden text-[13px] text-gray-500 sm:block">{note}</p>
        </div>
        <p className={`whitespace-nowrap text-sm font-semibold sm:pt-2 ${tbd ? "text-gray-500" : "text-gray-900"}`}>
          {amount}
        </p>
      </div>
      <p className="mt-0.5 text-[13px] text-gray-500 sm:hidden">{short ?? note}</p>
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 text-[13px] font-semibold text-gray-600 first:border-t-0 sm:px-6">
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-6 border-t border-gray-100 py-3.5 first:border-t-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-right text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function Avatar({ name, accent }: { name: string; accent?: boolean }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
        accent ? "bg-[#FBE4E3]" : "bg-gray-100 text-gray-600"
      }`}
      style={accent ? { color: RED } : undefined}
    >
      {initials}
    </div>
  );
}

// Inline color: globals.css `a` rule overrides Tailwind text colors.
function ContinueButton({ href, className }: { href: string; className: string }) {
  return (
    <a
      href={href}
      className={`justify-center rounded-md bg-[#B3211E] font-bold hover:bg-[#9A1C19] ${className}`}
      style={{ color: "#FFFFFF" }}
    >
      Continue with iClosed
    </a>
  );
}

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const leadId = verifyQuoteToken(token);
  const quote = leadId ? await loadLeadQuote(leadId) : null;
  if (!quote) notFound();

  const { lawyer, csm } = QUOTE_TEAM;
  const total = quote.legalFees + quote.disbursements;
  const side = quote.side;
  const both = side === "both";
  const condo = side === "condo";
  const price = (n: number | null) => (n === null ? null : money(n));
  const continueHref = `/quote/${encodeURIComponent(token)}/continue`;
  const quoteDate = formatDate(quote.createdAt);

  // Numbers inside copy come from fee settings.
  const fees = loadIclosedFees();
  const range = fees.file_types.purchase.disbursements_range;
  const payoutFee = fees.extras.extra_payout.fee;
  const fill = (text: string) =>
    text
      .replace("{range}", range ? `${dollars(range[0])} to ${dollars(range[1])}` : "")
      .replace("{extra_payout}", typeof payoutFee === "number" ? dollars(payoutFee) : "");
  const specSide = side === "buying" || side === "selling";
  const contactHref = specSide ? `mailto:${csm.email}` : `tel:${csm.phone.replace(/\D/g, "")}`;

  return (
    <div className="min-h-screen bg-[#FAFAFA] px-4 py-6 sm:py-12">
      <div className="mx-auto max-w-[880px]">
        <header className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4 sm:pb-6">
          <div className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
            <span className="italic" style={{ color: RED }}>i</span>Closed
          </div>
          <p className="text-[13px] text-gray-500">
            <span className="hidden sm:inline">Quote </span>{quote.quoteNumber ?? `Q-${quote.leadId.slice(0, 6).toUpperCase()}`}
            {quoteDate && <span className="hidden sm:inline"> · {quoteDate}</span>}
          </p>
        </header>

        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-gray-900 sm:mt-8 sm:text-4xl">{TITLE[side] ?? "Your quote"}</h1>
        <p className="mt-2 text-[15px] text-gray-600">
          Thanks for getting in touch. Here is what it costs to close {INTRO[side]}
          {condo ? "." : " with us."}
        </p>

        {/* Headline figures: stacked on phones, side by side on desktop */}
        <section className="mt-6 rounded-xl border border-gray-100 bg-gray-50 px-5 py-6 sm:mt-8 sm:flex sm:items-end sm:justify-between sm:px-8 sm:py-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Legal fees</p>
            <p className="mt-1 text-4xl font-extrabold text-gray-900">{money(quote.legalFees)}</p>
          </div>
          <div className="mt-5 sm:mt-0 sm:flex sm:items-stretch sm:gap-8">
            <div className="flex items-center justify-between border-t border-gray-200 py-3 sm:block sm:border-0 sm:py-0 sm:text-right">
              <p className="text-[13px] text-gray-500">{quote.disbursementsLabel}</p>
              <p className="text-sm font-bold text-gray-900 sm:text-xl">{money(quote.disbursements)}</p>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 pt-3 sm:block sm:border-0 sm:border-l sm:pl-8 sm:pt-0 sm:text-right">
              <p className="text-[13px] font-semibold text-gray-900 sm:font-normal sm:text-gray-500">Estimated total, plus HST</p>
              <p className="text-2xl font-extrabold text-gray-900">{money(total)}</p>
            </div>
          </div>
        </section>

        {/* Breakdown */}
        <section className="mt-5 overflow-hidden rounded-xl border border-gray-100 bg-white sm:mt-7">
          <SectionHead>Legal fees</SectionHead>
          {LEGAL_LINES[side].map((l) => (
            <Row key={l.title} title={l.title} note={fill(l.note)} short={l.short} amount={money(l.amount ?? quote.legalFees)} />
          ))}
          <SectionHead>Disbursements</SectionHead>
          <Row
            title={DISBURSEMENT_TITLE[side] ?? "Registration, searches and file costs"}
            note={fill(DISBURSEMENT_NOTE[side])}
            amount={money(quote.disbursements)}
          />
          {TBD_LINES[side].map((l) => (
            <Row key={l.title} title={l.title} note={l.note} short={l.short} amount={TBD} />
          ))}
        </section>

        {/* Team: one compact card on phones */}
        <section className="mt-5 rounded-xl border border-gray-100 bg-white p-5 sm:hidden">
          <h2 className="text-base font-bold text-gray-900">Your team</h2>
          <div className="mt-4 flex items-center gap-3">
            <Avatar name={lawyer.name} accent />
            <div>
              <p className="text-[15px] font-semibold text-gray-900">{lawyer.name}</p>
              <p className="text-[13px] text-gray-500">Lawyer · LSO {lawyer.lsoNumber}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Avatar name={csm.fullName} />
            <div>
              <p className="text-[15px] font-semibold text-gray-900">{csm.fullName}</p>
              <p className="text-[13px] text-gray-500">Customer Success Manager</p>
            </div>
          </div>
        </section>

        <div className="hidden sm:block">
          <h2 className="mt-10 text-xl font-bold text-gray-900">Your team</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="flex gap-4 rounded-xl border border-gray-100 bg-white p-5">
              <Avatar name={lawyer.name} accent />
              <div>
                <p className="text-[15px] font-semibold text-gray-900">{lawyer.name}</p>
                <p className="text-[13px] text-gray-500">Lawyer · Law Society number {lawyer.lsoNumber}</p>
                <p className="mt-1 text-[13px] text-gray-700">Responsible for your file.</p>
              </div>
            </div>
            <div className="flex gap-4 rounded-xl border border-gray-100 bg-white p-5">
              <Avatar name={csm.fullName} />
              <div>
                <p className="text-[15px] font-semibold text-gray-900">{csm.fullName}</p>
                <p className="text-[13px] text-gray-500">Customer Success Manager</p>
                <p className="mt-1 text-[13px] text-gray-700">
                  Your day to day contact.{" "}
                  <a href={contactHref} className="font-semibold" style={{ color: RED }}>
                    Get in touch
                  </a>
                </p>
              </div>
            </div>
          </div>

          <h2 className="mt-10 text-xl font-bold text-gray-900">Quote details</h2>
          <section className="mt-4 rounded-xl border border-gray-100 bg-white px-6 py-1">
            <Detail label={both ? "Purchase property" : "Property"} value={quote.purchaseAddress || null} />
            <Detail label={both ? "Sale property" : "Property"} value={quote.saleAddress || null} />
            <Detail label="Transaction" value={TRANSACTION[side]} />
            <Detail label="Purchase price" value={price(quote.purchasePrice)} />
            <Detail
              label={both ? "Purchase closing date" : condo ? "Occupancy date" : "Closing date"}
              value={formatDate(quote.purchaseClosingDate)}
            />
            {condo && <Detail label="Final closing" value="Set by the builder once the condo registers" />}
            <Detail label="Sale price" value={price(quote.salePrice)} />
            <Detail label={both ? "Sale closing date" : "Closing date"} value={formatDate(quote.saleClosingDate)} />
            <Detail label="Your email" value={quote.email} />
          </section>

          <section className="mt-7 flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white px-8 py-6">
            <div>
              <p className="text-lg font-bold text-gray-900">Ready to go ahead?</p>
              <p className="mt-1 text-sm text-gray-700">Continuing opens your retainer.</p>
            </div>
            <ContinueButton href={continueHref} className="inline-flex px-7 py-3 text-[15px]" />
          </section>
        </div>

        <ContinueButton href={continueHref} className="mt-5 flex w-full py-4 text-base sm:hidden" />

        <p className="mt-6 text-xs leading-relaxed text-gray-500 sm:mt-7">
          This quote is an estimate, prepared from the information we have today.
          <span className="hidden sm:inline">
            {" "}Government charges{side === "selling" ? " and " : ", "}{MOVING_FIGURES[side]} can move before closing.
          </span>{" "}
          If something on your file falls outside a standard closing, we will tell you the fee in writing,
          and get your agreement, before we do the work.
        </p>
      </div>
    </div>
  );
}
