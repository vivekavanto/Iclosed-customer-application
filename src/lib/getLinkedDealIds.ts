import supabaseAdmin from "@/lib/supabaseAdmin";

/**
 * Given a deal_id, find all related deal IDs via leads.parent_lead_id.
 * Returns deal IDs of co-purchaser/co-seller deals (excludes the input deal).
 */
export async function getLinkedDealIds(dealId: string): Promise<string[]> {
  // Get the lead_id for this deal
  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select("lead_id")
    .eq("id", dealId)
    .single();

  if (!deal?.lead_id) return [];

  // Get this lead's parent_lead_id
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id")
    .eq("id", deal.lead_id)
    .single();

  if (!lead) return [];

  // Determine the "root" lead (the primary)
  const rootLeadId = lead.parent_lead_id ?? lead.id;

  // Find all leads in this family: the root + all children
  const { data: familyLeads } = await supabaseAdmin
    .from("leads")
    .select("id")
    .or(`id.eq.${rootLeadId},parent_lead_id.eq.${rootLeadId}`);

  if (!familyLeads || familyLeads.length <= 1) return [];

  const familyLeadIds = familyLeads.map((l) => l.id);

  // Find deals for all family leads, excluding the current deal
  const { data: linkedDeals } = await supabaseAdmin
    .from("deals")
    .select("id")
    .in("lead_id", familyLeadIds)
    .neq("id", dealId);

  return (linkedDeals ?? []).map((d) => d.id);
}
