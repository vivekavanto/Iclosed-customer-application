import { NextResponse } from "next/server";
import {
  parseFileId,
  resolveClientEstimateContext,
} from "@/lib/clientEstimateContext";
import { firmFrom } from "@/lib/firmEmail";
import { resolveFirmKey } from "@/lib/firms";
import { loadIclosedFees } from "@/lib/loadIclosedFees";
import { draftFileInput, resolveDraftSide, saleFileInput } from "@/lib/loadDraftStatement";
import { parseDraftSideParam } from "@/lib/clientEstimateLock";
import { apsDepositPending } from "@/lib/fillDealDepositFromAps";

// GET /api/closing-estimate
//
// Everything the client's closing-cost page needs, in one round trip:
//
//   rates    the fee schedule to build the client's own what-if numbers from.
//            Taken from the issued estimate's frozen snapshot when there is
//            one, so exploring "what if I put more down?" uses the same fees
//            the firm quoted rather than today's standard.
//   prefill  the figures the calculator starts from, ALL resolved server-side
//            from the client's own file.
//   firm /   the LOCKED configuration for this file: one firm, one statement
//   statement_type
//            type. Not pickers — a client's firm is fixed by their file and
//            their copy is always the draft flavour, so offering a choice here
//            would be offering something the POST routes will refuse.
//
// Ownership is derived server-side from the session — the caller never supplies
// a deal id, so there is nothing to tamper with. Drafts are deliberately
// EXCLUDED: a draft is a staff working copy the client must never see.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // `file_id` names WHICH of the client's own files to load — the only thing a
  // caller may say. It is a uuid, not PII, so it is safe in a query string; the
  // figures and identity it resolves to never travel that way.
  const params = new URL(req.url).searchParams;
  const fileId = parseFileId(params.get("file_id"));
  if (fileId !== null && typeof fileId !== "string") {
    return NextResponse.json(
      { success: false, error: fileId.error },
      { status: 404 },
    );
  }

  const resolved = await resolveClientEstimateContext(fileId);
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error },
      { status: resolved.status },
    );
  }
  const ctx = resolved.context;
  const draftSide = await resolveDraftSide(ctx, parseDraftSideParam(params.get("side")));
  const draftInput = draftSide === "purchase" ? await draftFileInput(ctx) : null;
  const saleInput = draftSide === "sale" ? await saleFileInput(ctx) : null;

  return NextResponse.json({
    success: true,
    // Every file the client owns, so the modal can offer a choice when there is
    // more than one. Ids only — the figures come from a scoped request.
    files: ctx.files,
    deal: ctx.deal
      ? {
          id: ctx.deal.id,
          file_number: ctx.deal.file_number,
          property_address: ctx.deal.property_address,
          closing_date: ctx.deal.closing_date,
        }
      : null,
    issued: ctx.issued
      ? {
          id: ctx.issued.id,
          line_items: ctx.issued.line_items,
          total_closing_costs: ctx.issued.total_closing_costs,
          balance_due: ctx.issued.balance_due,
          issued_at: ctx.issued.issued_at,
          has_pdf: Boolean(ctx.issued.pdf_url),
          purchasers: ctx.issued.purchasers ?? null,
          property_address: ctx.issued.property_address ?? null,
          closing_date: ctx.issued.closing_date ?? null,
          file_no_display: ctx.issued.file_no_display ?? null,
          // From the estimate's OWN frozen snapshot, so the client's copy is
          // titled the way the document is — not the way the firm is named
          // today.
          firm_label: ctx.issuedFirmLabel,
        }
      : null,
    rates: ctx.rates,
    rates_from_issued_estimate: ctx.ratesFromIssuedEstimate,
    // The file's firm — branding only. There is no picker: see the note above.
    firm: {
      firm_key: ctx.firmKey,
      label: (ctx.config.label as string | null) ?? null,
      firm_badge: (ctx.config.firm_badge as string | null) ?? null,
      brand_color: (ctx.config.brand_color as string | null) ?? null,
    },
    statement_type: ctx.statementType,
    // v6 draft statement: fee settings plus the file's inputs.
    iclosed_fees: loadIclosedFees(),
    draft_side: draftSide,
    draft_input: draftInput,
    sale_input: saleInput,
    // No deposit yet but an APS was just saved: the modal waits for the read.
    deposit_pending:
      ctx.deal && (draftInput ?? saleInput)?.deposit == null
        ? await apsDepositPending(ctx.deal.id, draftSide)
        : false,
    // The addresses the "email it to me" preview shows before the client
    // sends. Read-only: the route decides the real recipient itself.
    email_envelope: {
      to: ctx.emailTo ?? "",
      from: firmFrom(resolveFirmKey(ctx.firmKey)),
    },
    prefill: {
      // Locked — shown, never sent back. The POST routes read these from the
      // file themselves and reject a body that carries them.
      purchase_price: ctx.locked.price,
      deposit_paid: ctx.locked.deposit,
      is_toronto: ctx.locked.isToronto,
      title_premium_override: ctx.locked.titlePremiumOverride,
      property_tax_adjustment: ctx.locked.propertyTaxAdjustment,
      // Which lines the firm marked provisional, so the client's chips match
      // the statement the firm issued.
      title_premium_is_estimate: ctx.locked.titlePremiumIsEstimate,
      teraview_is_estimate: ctx.locked.teraviewIsEstimate,
      sheriff_is_estimate: ctx.locked.sheriffIsEstimate,
      property_tax_is_estimate: ctx.locked.propertyTaxIsEstimate,
      file_no_display: ctx.locked.fileNo,
      purchasers: ctx.locked.purchasers,
      property_address: ctx.locked.propertyAddress,
      closing_date: ctx.locked.closingDate,
      // Editable — the only two answers a buyer supplies.
      mortgage_amount: ctx.mortgage,
      is_first_time_buyer: ctx.isFirstTimeBuyer,
      email: ctx.client.email ?? "",
      client_name: ctx.client.fullName,
    },
  });
}
