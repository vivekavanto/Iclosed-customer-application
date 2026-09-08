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

  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id, firm_key")
    .eq("id", anyFamilyLeadId)
    .maybeSingle();

  // Still defaults — this function must never throw — but a FAILED lookup and a
  // MISSING lead are not the same thing and used to be indistinguishable here.
  // In particular `column leads.firm_key does not exist` (the firm_key migration
  // not having been run) routed EVERY file to the default firm, and with it to
  // that firm's sending address, with nothing in the logs to say why.
  if (error) {
    console.error(
      "[leadFirm] firm_key lookup failed, defaulting to",
      DEFAULT_FIRM_KEY,
      "-",
      error.message,
    );
  }

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

/**
 * Firm for a deal, via its lead.
 *
 * Ported from the admin app, which has had it since firms were introduced. The
 * portal did without because nothing here started from a deal id — until the
 * milestone email needed one, and had to reach `deal.lead_id` by hand.
 */
export async function getDealFirmKey(
  dealId: string | null | undefined,
): Promise<FirmKey> {
  if (!dealId) return DEFAULT_FIRM_KEY;

  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select("lead_id")
    .eq("id", dealId)
    .maybeSingle();

  return getLeadFirmKey(deal?.lead_id ?? null);
}

/** Firm profile for a deal. */
export async function getDealFirm(
  dealId: string | null | undefined,
): Promise<FirmProfile> {
  return getFirm(await getDealFirmKey(dealId));
}

/**
 * Firm for a client (the portal login), via the client's most recent lead.
 *
 * A client can in principle hold several files, and they are branded by the
 * FILE rather than by the person — so this is only for the few sends that have a
 * client (or just an address) and no lead in hand. The password-reset email is
 * the one that matters: someone with files at both firms gets whichever is most
 * recent, which is a guess. It affects the sender address only; the reset link
 * itself is correct either way.
 */
export async function getClientFirmKey(
  clientId: string | null | undefined,
): Promise<FirmKey> {
  if (!clientId) return DEFAULT_FIRM_KEY;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("client_id", clientId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return getLeadFirmKey(lead?.id ?? null);
}
