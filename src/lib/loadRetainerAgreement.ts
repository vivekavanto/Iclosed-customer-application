import supabaseAdmin from "@/lib/supabaseAdmin";
import { getLeadFirmKey } from "@/lib/leadFirm";
import { loadIclosedFees } from "@/lib/loadIclosedFees";
import {
  buildRetainerAgreement,
  type AgreementKind,
  type RetainerAgreement,
} from "@/lib/retainerAgreement";

// Deal file number for the lead (or its primary); null if none yet.
async function readFileNo(leadId: string, rootId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("deals")
      .select("file_number")
      .in("lead_id", [...new Set([leadId, rootId])])
      .eq("is_deleted", false)
      .not("file_number", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fileNo = String(data?.file_number ?? "").trim();
    return fileNo || null;
  } catch {
    return null;
  }
}

// Optional leads.discount_amount; null when unset or the column is missing.
export async function readDiscount(rootId: string): Promise<number | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("discount_amount")
      .eq("id", rootId)
      .maybeSingle();
    if (error) return null;
    const n = Number(data?.discount_amount);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Builds a lead's v9 purchase or sale retainer from the fee settings. */
export async function loadRetainerAgreement(
  lead: { id: string; parent_lead_id?: string | null },
  property: string,
  kind: AgreementKind,
  date: string,
): Promise<RetainerAgreement> {
  const rootId = lead.parent_lead_id ?? lead.id;
  const [firmKey, fileNo, discount] = await Promise.all([
    getLeadFirmKey(lead.id),
    readFileNo(lead.id, rootId),
    readDiscount(rootId),
  ]);
  return buildRetainerAgreement(loadIclosedFees(), { kind, firmKey, property, fileNo, discount, date });
}
