import supabaseAdmin from "@/lib/supabaseAdmin";
import type { ClientEstimateContext } from "@/lib/clientEstimateContext";
import { readDiscount } from "@/lib/loadRetainerAgreement";
import {
  buildPurchaseDraft,
  buildSaleDraft,
  type DraftDocument,
  type DraftFileInput,
  type SaleFileInput,
} from "@/lib/draftStatement";
import { bundleDiscountSide, type IclosedFees } from "@/lib/iclosedFees";
import { parsePropertyType } from "@/lib/propertyType";
import { loadIclosedFees } from "@/lib/loadIclosedFees";

// Lead discount; bundles add $100 when the purchase closes later.
async function dealDiscount(dealId: string | undefined): Promise<number | null> {
  if (!dealId) return null;
  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select("lead_id, type, closing_date, selling_closing_date")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal?.lead_id) return null;
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id")
    .eq("id", deal.lead_id)
    .maybeSingle();
  const manual = lead ? await readDiscount(lead.parent_lead_id ?? lead.id) : null;
  if ((deal.type ?? "").trim() !== "Purchase & Sale") return manual;
  // Spec 5.3a: only the later closing gets it.
  if (bundleDiscountSide(deal.selling_closing_date ?? null, deal.closing_date ?? null) !== "purchase") return null;
  return manual ?? loadIclosedFees().bundles.sale_and_purchase.discount;
}

export async function draftFileInput(ctx: ClientEstimateContext): Promise<DraftFileInput> {
  return {
    name: ctx.locked.purchasers ?? ctx.client.fullName ?? null,
    property: ctx.locked.propertyAddress ?? null,
    closingDate: ctx.locked.closingDate ?? null,
    price: ctx.locked.price,
    // The deal's deposit, set from the uploaded APS.
    deposit: ctx.deal?.deposit_amount != null ? Number(ctx.deal.deposit_amount) : null,
    propertyTaxAdjustment: ctx.locked.propertyTaxAdjustment ?? null,
    isToronto: ctx.locked.isToronto,
    titlePremium: ctx.locked.titlePremiumOverride ?? null,
    discount: await dealDiscount(ctx.deal?.id),
    propertyType: parsePropertyType((await dealRow(ctx.deal?.id))?.building_type),
  };
}

export type DraftSide = "purchase" | "sale";

/** Sale for sale files; Buy & Sell follows the requested side. */
function draftSideFor(dealType: string | null | undefined, requested: DraftSide | null): DraftSide {
  const type = (dealType ?? "").trim().toLowerCase();
  if (type === "sale") return "sale";
  if (type === "purchase & sale") return requested ?? "purchase";
  return "purchase";
}

// Whole row so a missing optional column never fails the read.
async function dealRow(dealId: string | undefined): Promise<Record<string, unknown> | null> {
  if (!dealId) return null;
  const { data } = await supabaseAdmin.from("deals").select("*").eq("id", dealId).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

const amountOf = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Which side this file's draft is for. */
export async function resolveDraftSide(ctx: ClientEstimateContext, requested: DraftSide | null): Promise<DraftSide> {
  const deal = await dealRow(ctx.deal?.id);
  return draftSideFor(deal?.type as string | null, requested);
}

/** Sale file inputs; Buy & Sell reads the sale columns and the lead's sale deposit. */
export async function saleFileInput(ctx: ClientEstimateContext): Promise<SaleFileInput> {
  const deal = await dealRow(ctx.deal?.id);
  const both = String(deal?.type ?? "").trim().toLowerCase() === "purchase & sale";
  let deposit = amountOf(deal?.deposit_amount);
  if (both) {
    deposit = null;
    if (deal?.lead_id) {
      const { data: lead } = await supabaseAdmin.from("leads").select("*").eq("id", deal.lead_id).maybeSingle();
      deposit = amountOf((lead as Record<string, unknown> | null)?.selling_deposit_amount);
    }
  }
  return {
    name: ctx.locked.purchasers ?? ctx.client.fullName ?? null,
    property: both ? ((deal?.selling_property_address as string | null) ?? null) : ctx.locked.propertyAddress,
    closingDate: both ? ((deal?.selling_closing_date as string | null) ?? null) : ctx.locked.closingDate,
    price: both ? (amountOf(deal?.selling_price) ?? 0) : ctx.locked.price,
    deposit,
    discount: await dealDiscount(ctx.deal?.id),
  };
}

export interface ClientDraft {
  side: DraftSide;
  draft: DraftDocument;
  price: number;
  /** Funds required (purchase) or proceeds (sale). */
  headline: number | null;
  /** Purchase: fees, tax and title insurance; sale: legal fees, disbursements and HST. */
  costsTotal: number;
}

/** The client's draft for the resolved side, as the modal shows it. */
export async function buildClientDraft(
  ctx: ClientEstimateContext,
  fees: IclosedFees,
  answers: { side: DraftSide | null; mortgage: number; firstTimeBuyer: boolean; commissionRate: number | null },
): Promise<ClientDraft> {
  const side = await resolveDraftSide(ctx, answers.side);
  if (side === "sale") {
    const input = await saleFileInput(ctx);
    const draft = buildSaleDraft(fees, { ...input, mortgageBalance: answers.mortgage, commissionRate: answers.commissionRate });
    return { side, draft, price: input.price, headline: draft.proceeds, costsTotal: draft.feesTotal };
  }
  const input = await draftFileInput(ctx);
  const draft = buildPurchaseDraft(fees, { ...input, mortgage: answers.mortgage, firstTimeBuyer: answers.firstTimeBuyer });
  return { side, draft, price: input.price, headline: draft.fundsRequired, costsTotal: draft.closingCostsTotal };
}
