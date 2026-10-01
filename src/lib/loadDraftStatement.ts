import supabaseAdmin from "@/lib/supabaseAdmin";
import type { ClientEstimateContext } from "@/lib/clientEstimateContext";
import { readDiscount } from "@/lib/loadRetainerAgreement";
import type { DraftFileInput } from "@/lib/draftStatement";
import { bundleDiscountSide } from "@/lib/iclosedFees";
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
  };
}
