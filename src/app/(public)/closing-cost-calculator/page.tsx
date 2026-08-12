import type { Metadata } from "next";
import PublicClosingCostCalculator from "@/components/PublicClosingCostCalculator";
import {
  publicConfigPayload,
  readPublicConfig,
} from "@/lib/publicClosingEstimate";

// The shareable closing-cost estimator: /closing-cost-calculator
//
// PUBLIC — no session, no file, no client, no lead. Anyone with the link can
// type their own numbers and get the firm's published fee schedule applied to
// them.
//
// It sits in the (public) group with /login and /set-password, which is the
// portal's existing no-session surface. Nothing else had to be told about it:
// src/middleware.ts guards PAGES only through its explicit PROTECTED_PAGES list
// and matcher, neither of which mentions /closing-cost-calculator, and the auth
// gate lives in the (dashboard) group's layout rather than in a global shell —
// so a visitor with no cookie reaches this page without a redirect.

/**
 * ISR. The rate card is identical for every visitor and changes only when a
 * staff member edits Settings in the admin panel, so the page is served static
 * and re-rendered at most once a minute — the same freshness contract
 * /api/calculator/config publishes in its Cache-Control header.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Closing Cost Calculator | iClosed",
  description:
    "Estimate the land transfer tax, title insurance, disbursements and legal fees on an Ontario home purchase — and see the funds you'll need on closing day.",
  // A calculator is only useful with today's fee schedule behind it, and it is
  // the same page for everyone, so it is indexable.
  robots: { index: true, follow: true },
  openGraph: {
    title: "Closing Cost Calculator",
    description:
      "Estimate your Ontario home purchase closing costs and the funds you'll need on closing day.",
    type: "website",
  },
};

export default async function CalculatorPage() {
  // Resolved HERE rather than fetched from the browser, so the first paint
  // already carries the firm's real figures.
  //
  // Fetching client-side meant the statement rendered twice: once from
  // DEFAULT_RATES with no Statement of Adjustments figure, then again a moment
  // later with the firm's — so the headline visibly jumped ($2,105.89 →
  // $3,105.89 on an untouched form). A number that corrects itself in front of
  // the visitor undermines the one thing this page is for.
  //
  // Only `publicConfigPayload`'s allowlist crosses into the client component;
  // the merged row and the service-role client stay on the server. The readers
  // degrade to code defaults rather than throwing, so an unreachable database
  // costs correct figures, never the page.
  const { config, statementType } = await readPublicConfig();

  return (
    <PublicClosingCostCalculator
      initialConfig={publicConfigPayload(config, statementType)}
    />
  );
}
