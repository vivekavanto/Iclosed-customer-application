import supabaseAdmin from "@/lib/supabaseAdmin";
import { getLeadFirmKey } from "@/lib/leadFirm";
import { ratesFromConfigRow } from "@/lib/closingCosts";
import { readFirmAndSharedRow } from "@/lib/closingCostRates";
import {
  QUOTE_LEGAL_FEES,
  purchaseTaxableDisbursements,
  quoteFigures,
  saleTaxableDisbursements,
} from "@/lib/quotePricing";
import type { AgreementKind, RetainerAgreementData } from "@/lib/retainerAgreement";

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
async function readDiscount(rootId: string): Promise<number | null> {
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

/** Server-side figures for a lead's v7 purchase or sale retainer. */
export async function loadRetainerAgreementData(
  lead: { id: string; parent_lead_id?: string | null },
  property: string,
  kind: AgreementKind,
): Promise<RetainerAgreementData> {
  const rootId = lead.parent_lead_id ?? lead.id;
  const firmKey = await getLeadFirmKey(lead.id);
  const [{ row }, fileNo, discount] = await Promise.all([
    readFirmAndSharedRow(firmKey),
    readFileNo(lead.id, rootId),
    readDiscount(rootId),
  ]);
  const rates = ratesFromConfigRow(row);
  const side = kind === "purchase" ? "buying" : "selling";

  return {
    kind,
    firmKey,
    property,
    fileNo,
    legalFees: QUOTE_LEGAL_FEES[side],
    discount,
    disbursements: quoteFigures(side, rates).disbursements,
    taxableDisbursements:
      kind === "purchase" ? purchaseTaxableDisbursements(rates) : saleTaxableDisbursements(rates),
    hstRate: rates.hstRate,
    hstNumber: String(row.firm_hst_number ?? "").trim() || null,
  };
}
