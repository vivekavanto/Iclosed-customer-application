// Converts a signer's lead family into deals.
import supabaseAdmin from "@/lib/supabaseAdmin";
import { convertSingleLead, syncSharedTasksAcrossDeals } from "@/lib/convertLead";

type LeadRow = Record<string, unknown> & { id: string; status?: string | null };

// Returns the lead's live deal; soft-deletes a link-leads "Pending" placeholder.
async function liveDeal(leadId: string): Promise<{ id: string; client_id: string | null } | null> {
  const { data: deals } = await supabaseAdmin
    .from("deals")
    .select("id, status, client_id")
    .eq("lead_id", leadId)
    .eq("is_deleted", false);
  for (const d of deals ?? []) {
    if (d.status !== "Pending") return { id: d.id, client_id: d.client_id };
  }
  const placeholders = (deals ?? []).map((d) => d.id);
  if (placeholders.length > 0) {
    // Placeholders carry no tasks; the converted deal replaces them.
    await supabaseAdmin.from("deals").update({ is_deleted: true }).in("id", placeholders);
  }
  return null;
}

/** Mirrors admin convert-lead, without invites. Never throws. */
export async function autoConvertAfterRetainer(signerLeadId: string): Promise<void> {
  try {
    const { data: signer } = await supabaseAdmin
      .from("leads")
      .select("id, parent_lead_id")
      .eq("id", signerLeadId)
      .maybeSingle();
    if (!signer) return;
    const primaryId = (signer.parent_lead_id as string | null) ?? signer.id;

    const { data: family } = await supabaseAdmin
      .from("leads")
      .select("*")
      .or(`id.eq.${primaryId},parent_lead_id.eq.${primaryId}`);
    const primary = (family ?? []).find((l) => l.id === primaryId) as LeadRow | undefined;
    if (!primary) return;

    // An address match awaits an admin's linking decision.
    const flag = primary.address_match_flag as { status?: string } | null;
    if (flag?.status === "pending") {
      console.log(`[auto-convert] lead=${primaryId} skipped: address match pending review`);
      return;
    }

    let primaryDeal = await liveDeal(primaryId);
    if (!primaryDeal && primary.status !== "Converted") {
      const r = await convertSingleLead({ lead: primary, sendInvite: false });
      if (!r.success) {
        console.error(`[auto-convert] lead=${primaryId} failed: ${r.error}`);
        return;
      }
      primaryDeal = { id: r.deal_id, client_id: r.client_id };
    }
    if (!primaryDeal) return;

    for (const co of (family ?? []) as LeadRow[]) {
      if (co.id === primaryId || co.status === "Converted") continue;
      if (await liveDeal(co.id)) continue;
      const r = await convertSingleLead({ lead: co, parentClientId: primaryDeal.client_id, sendInvite: false });
      if (!r.success) console.error(`[auto-convert] co-lead=${co.id} failed: ${r.error}`);
    }

    await syncSharedTasksAcrossDeals(primaryDeal.id);
    console.log(`[auto-convert] lead=${primaryId} converted after retainer signature`);
  } catch (err) {
    console.error("[auto-convert] error:", err);
  }
}
