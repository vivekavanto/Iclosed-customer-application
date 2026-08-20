import supabaseAdmin from "@/lib/supabaseAdmin";

// Takes any lead in the family. Null when unresolvable, so callers can fail open.
export async function getFamilyPartyCount(
  anyFamilyLeadId: string
): Promise<number | null> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id")
    .eq("id", anyFamilyLeadId)
    .maybeSingle();
  if (!lead) return null;

  const primaryId = lead.parent_lead_id ?? lead.id;

  const { count, error } = await supabaseAdmin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .or(`id.eq.${primaryId},parent_lead_id.eq.${primaryId}`);

  if (error || count == null) return null;
  return count;
}
