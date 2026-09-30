import supabaseAdmin from "@/lib/supabaseAdmin";
import type { ClientEstimateContext } from "@/lib/clientEstimateContext";
import { readDiscount } from "@/lib/loadRetainerAgreement";
import type { DraftFileInput } from "@/lib/draftStatement";

// Discount lives on the deal's primary lead.
async function dealDiscount(dealId: string | undefined): Promise<number | null> {
  if (!dealId) return null;
  const { data: deal } = await supabaseAdmin.from("deals").select("lead_id").eq("id", dealId).maybeSingle();
  if (!deal?.lead_id) return null;
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id")
    .eq("id", deal.lead_id)
    .maybeSingle();
  return lead ? readDiscount(lead.parent_lead_id ?? lead.id) : null;
}

export async function draftFileInput(ctx: ClientEstimateContext): Promise<DraftFileInput> {
  const depositKnown = ctx.locked.deposit > 0 || ctx.deal?.deposit_amount != null;
  return {
    name: ctx.locked.purchasers ?? ctx.client.fullName ?? null,
    property: ctx.locked.propertyAddress ?? null,
    closingDate: ctx.locked.closingDate ?? null,
    price: ctx.locked.price,
    deposit: depositKnown ? ctx.locked.deposit : null,
    propertyTaxAdjustment: ctx.locked.propertyTaxAdjustment ?? null,
    isToronto: ctx.locked.isToronto,
    titlePremium: ctx.locked.titlePremiumOverride ?? null,
    discount: await dealDiscount(ctx.deal?.id),
  };
}
