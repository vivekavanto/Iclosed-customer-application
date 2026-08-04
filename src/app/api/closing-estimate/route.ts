import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeals } from "@/lib/getAuthClient";
import {
  readFirmOptions,
  readStatementTypeOptions,
  resolveClientRates,
} from "@/lib/closingCostRates";

// GET /api/closing-estimate
//
// Everything the client's closing-cost page needs, in one round trip:
//
//   issued   the statement the firm has issued, as its FROZEN line_items
//            snapshot. Read-only and authoritative — this is what the client
//            was actually quoted.
//   rates    the fee schedule to build the client's own what-if numbers from.
//            Taken from the issued estimate's frozen snapshot when there is
//            one, so exploring "what if I put more down?" uses the same fees
//            the firm quoted rather than today's standard.
//   prefill  starting values for the calculator, from the client's own file.
//
// Ownership is derived server-side from the session — the caller never supplies
// a deal id, so there is nothing to tamper with. Drafts are deliberately
// EXCLUDED: a draft is a staff working copy the client must never see.

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthClientDeals();
  if (!auth?.client) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  // The pickers are configuration, not file data, so they load even for a
  // client who has no deal yet.
  const [firms, statementTypes] = await Promise.all([
    readFirmOptions(),
    readStatementTypeOptions(),
  ]);

  const deals = auth.deals ?? [];
  if (deals.length === 0) {
    return NextResponse.json({
      success: true,
      deal: null,
      issued: null,
      rates: firms[0]?.rates ?? null,
      firms,
      statement_types: statementTypes,
      prefill: {
        purchase_price: 0,
        deposit_paid: 0,
        mortgage_amount: 0,
        is_toronto: false,
        is_first_time_buyer: false,
        email: auth.client.email ?? "",
        client_name:
          `${auth.client.first_name ?? ""} ${auth.client.last_name ?? ""}`.trim(),
      },
    });
  }

  const dealIds = deals.map((d) => d.id);

  // The latest issued estimate across the client's files. `status = 'issued'`
  // is the load-bearing filter here — never show a draft.
  const { data: issuedRows } = await supabaseAdmin
    .from("deal_closing_estimates")
    .select("*")
    .in("deal_id", dealIds)
    .eq("status", "issued")
    .eq("is_deleted", false)
    .order("issued_at", { ascending: false })
    .limit(1);

  const issued = issuedRows?.[0] ?? null;

  // Prefer the file the estimate belongs to; otherwise the most recent deal.
  const deal = issued
    ? (deals.find((d) => d.id === issued.deal_id) ?? deals[0])
    : deals[0];

  const { rates, fromIssuedEstimate } = await resolveClientRates(
    issued?.rates_used ?? null,
    issued?.firm_key ?? null,
  );

  return NextResponse.json({
    success: true,
    deal: deal
      ? {
          id: deal.id,
          file_number: deal.file_number,
          property_address: deal.property_address,
          closing_date: deal.closing_date,
        }
      : null,
    issued: issued
      ? {
          id: issued.id,
          line_items: issued.line_items,
          total_closing_costs: issued.total_closing_costs,
          balance_due: issued.balance_due,
          issued_at: issued.issued_at,
          has_pdf: Boolean(issued.pdf_url),
          purchasers: issued.purchasers ?? null,
          property_address: issued.property_address ?? null,
          closing_date: issued.closing_date ?? null,
          file_no_display: issued.file_no_display ?? null,
          statement_type: issued.statement_type ?? null,
          // The page uses this to tell "still on the firm that quoted me" from
          // "exploring a different firm", which decides whether the frozen fee
          // schedule or that firm's current standard applies.
          firm_key: issued.firm_key ?? null,
        }
      : null,
    rates,
    rates_from_issued_estimate: fromIssuedEstimate,
    firms,
    statement_types: statementTypes,
    prefill: {
      // The issued figures seed the calculator so the client starts from what
      // the firm quoted and edits away from it, rather than from a blank form.
      purchase_price: issued?.purchase_price ?? deal?.price ?? 0,
      deposit_paid: issued?.deposit_paid ?? 0,
      mortgage_amount: issued?.mortgage_amount ?? 0,
      is_toronto:
        issued?.is_toronto ??
        /\btoronto\b/i.test(String(deal?.property_address ?? "")),
      is_first_time_buyer: issued?.is_first_time_buyer ?? false,
      // Without these two the client's copy would silently start WITHOUT an
      // override or adjustment the firm actually applied, so their estimate
      // would differ from the lawyer's for a reason they did not cause.
      title_premium_override: issued?.title_premium_override ?? null,
      property_tax_adjustment: issued?.property_tax_adjustment ?? null,
      email: auth.client.email ?? "",
      client_name:
        `${auth.client.first_name ?? ""} ${auth.client.last_name ?? ""}`.trim(),
      // Seeds the optional file-details block on the statement header.
      file_no_display: issued?.file_no_display ?? deal?.file_number ?? null,
      purchasers: issued?.purchasers ?? null,
      property_address: issued?.property_address ?? deal?.property_address ?? null,
      closing_date: issued?.closing_date ?? deal?.closing_date ?? null,
      firm_key: issued?.firm_key ?? firms[0]?.firm_key ?? null,
      statement_type: issued?.statement_type ?? "draft",
    },
  });
}
