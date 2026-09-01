import supabaseAdmin from "@/lib/supabaseAdmin";
import { DEFAULT_FIRM_KEY, getFirm, resolveFirmKey, type FirmKey, type FirmProfile } from "@/lib/firms";

/**
 * Which firm a file belongs to — Nava Wilson or iClosed LLP.
 *
 * Ported from the admin app's src/lib/leadFirm.ts so both repos resolve the
 * label the same way. The value lives on `leads.firm_key`, and the ROOT lead of
 * the family is authoritative: pass ANY lead in the family (primary or a
 * co-purchaser / co-seller) and this follows `parent_lead_id` up to the primary
 * and reads it there.
 *
 * A file cannot be half Nava Wilson and half iClosed — co-clients on one
 * transaction are retained by ONE firm and sign ONE retainer wording. Reading
 * the root rather than the row in hand is what guarantees a co-purchaser's
 * retainer names the same entity the primary's did.
 *
 * Never throws. A lookup that fails — a missing row, or a deploy that reached
 * this code before the firm_key migration ran — resolves to DEFAULT_FIRM_KEY,
 * which is what every file was before firms existed. Failing the retainer
 * because a label could not be read would be far worse than a default one.
 */
export async function getLeadFirmKey(
  anyFamilyLeadId: string | null | undefined,
): Promise<FirmKey> {
  if (!anyFamilyLeadId) return DEFAULT_FIRM_KEY;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id, firm_key")
    .eq("id", anyFamilyLeadId)
    .maybeSingle();

  if (!lead) return DEFAULT_FIRM_KEY;

  const rootId = lead.parent_lead_id ?? lead.id;
  if (rootId === lead.id) return resolveFirmKey(lead.firm_key);

  const { data: root } = await supabaseAdmin
    .from("leads")
    .select("firm_key")
    .eq("id", rootId)
    .maybeSingle();

  // A child whose parent has been hard-deleted still carries its own copy,
  // kept in step by the admin app; prefer it over silently defaulting.
  return resolveFirmKey(root?.firm_key ?? lead.firm_key);
}

/** Firm profile for any lead in a family. */
export async function getLeadFirm(
  anyFamilyLeadId: string | null | undefined,
): Promise<FirmProfile> {
  return getFirm(await getLeadFirmKey(anyFamilyLeadId));
}
