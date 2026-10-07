import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifyQuoteToken } from "@/lib/quoteToken";
import { loadLeadQuote, type LeadQuote } from "@/lib/leadQuote";
import { QUOTE_TEAM } from "@/lib/quotePricing";
import { dollars, type IclosedFees } from "@/lib/iclosedFees";
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
  both: "your sale and your purchase",
  refinance: "your refinance",
  condo: "your new condo with us, from occupancy to final closing",
};

// Condo amounts come from fee settings.
const legalLines = (fees: IclosedFees): Record<Side, Line[]> => ({
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
  // Bundles render per-file groups instead; see bundleGroups().
  both: [],
  refinance: [
    {
      title: "Refinance, including first mortgage payout",
      note: "Includes paying out your existing mortgage and registering the new one. Any other payout is {extra_payout} plus HST.",
      amount: null,
    },
  ],
  condo: [
    {
      title: "Occupancy closing",
      note: "When you move in, before the condo is registered.",
      amount: fees.file_types.new_build_condo.legal_fees.occupancy ?? null,
    },
    {
      title: "Final closing, for title transfer and mortgage",
      note: "When the condo registers and the unit is transferred to you.",
      amount: fees.file_types.new_build_condo.legal_fees.final_closing ?? null,
    },
    {
      title: "Agreement review, optional",
      note: "Best done in your 10-day cooling-off period. {builder_correspondence} more if we write to the builder's lawyer. Not in the total above.",
      amount: fees.file_types.new_build_condo.agreement_review?.fee ?? null,
    },
  ],
});

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
  refinance: "Typical range is {range}. Itemised in full on your draft statement of account.",
  condo: "Typical range is {range}. Charged at final closing. Itemised in full on your draft statement of account.",
};

const TRANSACTION: Record<Side, string> = {
  buying: "Purchase with one new mortgage",
  selling: "Sale with one mortgage payout",
  both: "Purchase and sale",
  refinance: "Refinance with one mortgage payout",
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

const TITLE: Partial<Record<Side, string>> = {
  both: "Your sale and purchase quote",
  buying: "Your purchase quote",
  selling: "Your sale quote",
  refinance: "Your refinance quote",
  condo: "Your new condo quote",
};

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

function SectionHead({ children, aside }: { children: React.ReactNode; aside?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-t border-gray-100 bg-gray-50 px-4 py-3 text-[13px] font-semibold text-gray-600 first:border-t-0 sm:px-6">
      <span>{children}</span>
      {aside && <span className="font-normal text-gray-500">{aside}</span>}
    </div>
  );
}

type GroupRow = { title: string; note: string; amount: string };
type Group = { key: "sale" | "purchase"; head: string; closes: string | null; rows: GroupRow[] };

// Spec 7A: one group per file, in closing order.
function bundleGroups(quote: LeadQuote, fill: (t: string) => string): Group[] {
  const b = quote.bundle!;
  const discountRow = (side: "sale" | "purchase"): GroupRow[] =>
    b.discountSide === side
      ? [
          {
            title: "Discount for buying and selling with us",
            note: `Comes off the closing that happens later, which is your ${side}. If both close on the same day, it comes off the purchase.`,
            amount: `(${money(b.discount)})`,
          },
        ]
      : [];
  const sale: Group = {
    key: "sale",
    head: "Your sale",
    closes: formatDate(quote.saleClosingDate),
    rows: [
      {
        title: "Legal fees: sale, including first mortgage, property tax and commission payout",
        note: fill("Includes your first mortgage, property tax and commission payouts. Any other payout is {extra_payout} plus HST."),
        amount: money(b.sale.legalFees),
      },
      ...discountRow("sale"),
      {
        title: "Estimated disbursements: levy, software and file costs",
        note: "Itemised in full on your draft statement of account.",
        amount: money(b.sale.disbursements),
      },
    ],
  };
  const purchase: Group = {
    key: "purchase",
    head: "Your purchase",
    closes: formatDate(quote.purchaseClosingDate),
    rows: [
      {
        title: "Legal fees: purchase, for title transfer and mortgage",
        note: "One property, one new mortgage.",
        amount: money(b.purchase.legalFees),
      },
      ...discountRow("purchase"),
      {
        title: "Estimated disbursements: registration, searches and file costs",
        note: fill("Typical range is {range}. Itemised in full on your draft statement of account."),
        amount: money(b.purchase.disbursements),
      },
      ...TBD_LINES.buying.map((l) => ({ title: l.title, note: l.note, amount: TBD })),
    ],
  };
  const purchaseFirst =
    Boolean(quote.saleClosingDate && quote.purchaseClosingDate) && quote.purchaseClosingDate! < quote.saleClosingDate!;
  return purchaseFirst ? [purchase, sale] : [sale, purchase];
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

  const { lawyer, csm, clerk } = QUOTE_TEAM;
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
  const review = fees.file_types.new_build_condo.agreement_review;
  const fill = (text: string) =>
    text
      .replace("{range}", range ? `${dollars(range[0])} to ${dollars(range[1])}` : "")
      .replace("{extra_payout}", typeof payoutFee === "number" ? dollars(payoutFee) : "")
      .replace("{builder_correspondence}", review ? dollars(review.builder_correspondence) : "");
  const contactHref = `mailto:${csm.email}`;
  const bundle = both ? quote.bundle : null;
  const discountText = bundle ? dollars(bundle.discount) : "";
  // "$1,100,000.00 · one mortgage payout · closes 27 November 2026"
  const fileSummary = (amount: number | null, what: string, closing: string | null) =>
    [price(amount), what, formatDate(closing) && `closes ${formatDate(closing)}`].filter(Boolean).join(" · ");

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
          {bundle && ` Because we are closing both, you get ${discountText} off.`}
        </p>

        {/* Headline figures: stacked on phones, side by side on desktop */}
        <section className="mt-6 rounded-xl border border-gray-100 bg-gray-50 px-5 py-6 sm:mt-8 sm:flex sm:items-end sm:justify-between sm:px-8 sm:py-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {bundle ? "Legal fees, both closings" : "Legal fees"}
            </p>
            <p className="mt-1 text-4xl font-extrabold text-gray-900">{money(quote.legalFees)}</p>
            {bundle && <p className="mt-1 text-xs text-gray-500">After your {discountText} discount</p>}
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
        {bundle ? (
          <section className="mt-5 overflow-hidden rounded-xl border border-gray-100 bg-white sm:mt-7">
            {bundleGroups(quote, fill).map((g) => (
              <div key={g.key}>
                <SectionHead aside={g.closes && `Closes ${g.closes}`}>{g.head}</SectionHead>
                {g.rows.map((r) => (
                  <Row key={r.title} title={r.title} note={r.note} amount={r.amount} />
                ))}
              </div>
            ))}
          </section>
        ) : (
        <section className="mt-5 overflow-hidden rounded-xl border border-gray-100 bg-white sm:mt-7">
          <SectionHead>Legal fees</SectionHead>
          {legalLines(fees)[side].map((l) => (
            <Row key={l.title} title={l.title} note={fill(l.note)} short={l.short} amount={money(l.amount ?? quote.legalFees)} />
          ))}
          <SectionHead>{quote.disbursementsLabel}</SectionHead>
          <Row
            title={DISBURSEMENT_TITLE[side] ?? "Registration, searches and file costs"}
            note={fill(DISBURSEMENT_NOTE[side])}
            amount={money(quote.disbursements)}
          />
          {TBD_LINES[side].map((l) => (
            <Row key={l.title} title={l.title} note={l.note} short={l.short} amount={TBD} />
          ))}
        </section>
        )}

        {/* Team: one compact card on phones */}
        <section className="mt-5 rounded-xl border border-gray-100 bg-white p-5 sm:hidden">
          <h2 className="text-base font-bold text-gray-900">Your team</h2>
          {bundle && <p className="mt-1 text-[13px] text-gray-600">The same team handles both closings and times them together.</p>}
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
          <div className="mt-4 flex items-center gap-3">
            <Avatar name={clerk.name} />
            <div>
              <p className="text-[15px] font-semibold text-gray-900">{clerk.name}</p>
              <p className="text-[13px] text-gray-500">Law Clerk</p>
            </div>
          </div>
        </section>

        <div className="hidden sm:block">
          <h2 className="mt-10 text-xl font-bold text-gray-900">Your team</h2>
          {bundle && <p className="mt-2 text-[13px] text-gray-600">The same team handles both closings and times them together.</p>}
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <div className="flex gap-4 rounded-xl border border-gray-100 bg-white p-5">
              <Avatar name={lawyer.name} accent />
              <div>
                <p className="text-[15px] font-semibold text-gray-900">{lawyer.name}</p>
                <p className="text-[13px] text-gray-500">Lawyer · Law Society number {lawyer.lsoNumber}</p>
                <p className="mt-1 text-[13px] text-gray-700">{bundle ? "Responsible for both files." : "Responsible for your file."}</p>
              </div>
            </div>
            <div className="flex gap-4 rounded-xl border border-gray-100 bg-white p-5">
              <Avatar name={csm.fullName} />
              <div>
                <p className="text-[15px] font-semibold text-gray-900">{csm.fullName}</p>
                <p className="text-[13px] text-gray-500">Customer Success Manager</p>
                <p className="mt-1 text-[13px] text-gray-700">Your day to day contact.</p>
                <a href={contactHref} className="mt-1 inline-block text-[13px] font-semibold" style={{ color: RED }}>
                  Get in touch
                </a>
              </div>
            </div>
            <div className="flex gap-4 rounded-xl border border-gray-100 bg-white p-5">
              <Avatar name={clerk.name} />
              <div>
                <p className="text-[15px] font-semibold text-gray-900">{clerk.name}</p>
                <p className="text-[13px] text-gray-500">Law Clerk</p>
              </div>
            </div>
          </div>

          <h2 className="mt-10 text-xl font-bold text-gray-900">Quote details</h2>
          {bundle ? (
            <section className="mt-4 rounded-xl border border-gray-100 bg-white px-6 py-1">
              <Detail label="Property you are selling" value={quote.saleAddress || null} />
              <Detail label="Sale" value={fileSummary(quote.salePrice, "one mortgage payout", quote.saleClosingDate)} />
              <Detail label="Property you are buying" value={quote.purchaseAddress || null} />
              <Detail label="Purchase" value={fileSummary(quote.purchasePrice, "one new mortgage", quote.purchaseClosingDate)} />
              <Detail label="Your email" value={quote.email} />
            </section>
          ) : (
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
          )}

          <section className="mt-7 flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white px-8 py-6">
            <div>
              <p className="text-lg font-bold text-gray-900">Ready to go ahead?</p>
              <p className="mt-1 text-sm text-gray-700">
                {bundle
                  ? "Continuing opens your two retainers, one for the sale and one for the purchase."
                  : "Continuing opens your retainer."}
              </p>
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
          If something on {bundle ? "either file" : "your file"} falls outside a standard closing, we will tell you the fee in writing,
          and get your agreement, before we do the work.
        </p>
      </div>
    </div>
  );
}
