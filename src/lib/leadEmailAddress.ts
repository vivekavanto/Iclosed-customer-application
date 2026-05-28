import supabaseAdmin from "./supabaseAdmin";

/**
 * Builds a single address string for a lead's outbound email.
 *
 * For Purchase & Sale leads, returns "<purchase address> and <selling address>".
 *
 * Whether a lead is treated as P&S is intentionally NOT decided by this
 * single lead row's `lead_type` alone — intake often splits a P&S family
 * across siblings (e.g. primary lead_type="Purchase" + co-lead lead_type=
 * "Sale") even though the deal is "Purchase & Sale". Three signals are
 * checked, any of which marks the lead as combined:
 *
 *   1. This lead's own lead_type contains both "purchase" and "sale"
 *   2. Both purchase and selling addresses are already populated on the row
 *   3. The family (root + siblings) has any "Purchase & Sale" sibling, OR
 *      has at least one purchase address AND one selling address across rows
 *
 * Family rows are also scanned to backfill whichever side is missing on
 * the passed-in lead, so the combined "<purchase> and <selling>" line is
 * always complete when the data exists somewhere in the family.
 *
 * Mirrors the same helper in the iclosed_admin repo at
 * src/lib/leadEmailAddress.ts — keep the two in sync.
 */

export function formatLeadTypeLabel(rawType: string | null | undefined): string {
  const lt = (rawType ?? "").toLowerCase().trim();
  if (lt.includes("purchase") && lt.includes("sale")) return "Purchase & Sale";
  if (lt === "sale" || (lt.includes("sale") && !lt.includes("purchase"))) return "Sale";
  if (lt === "purchase") return "Purchase";
  if (lt === "refinance") return "Refinance";
  return (rawType ?? "").trim();
}

function joinAddress(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(", ");
}

type LeadAddressFields = {
  id?: string | null;
  parent_lead_id?: string | null;
  lead_type?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  address_postal_code?: string | null;
  selling_address_street?: string | null;
  selling_address_city?: string | null;
  selling_address_province?: string | null;
  selling_address_postal_code?: string | null;
};

export type LeadAddressParts = {
  combinedString: string;
  purchase: string;
  selling: string;
  isCombined: boolean;
};

export async function buildLeadAddressForEmail(
  lead: LeadAddressFields | null | undefined,
): Promise<string> {
  const parts = await buildLeadAddressPartsForEmail(lead);
  return parts.combinedString;
}

export async function buildLeadAddressPartsForEmail(
  lead: LeadAddressFields | null | undefined,
): Promise<LeadAddressParts> {
  if (!lead) return { combinedString: "", purchase: "", selling: "", isCombined: false };

  const rawType = (lead.lead_type ?? "").toLowerCase().trim();
  const typeIsCombined = rawType.includes("purchase") && rawType.includes("sale");
  const typeIsSaleOnly = !typeIsCombined && rawType.includes("sale");

  let purchase = joinAddress([
    lead.address_street,
    lead.address_city,
    lead.address_province,
    lead.address_postal_code,
  ]);
  let selling = joinAddress([
    lead.selling_address_street,
    lead.selling_address_city,
    lead.selling_address_province,
    lead.selling_address_postal_code,
  ]);

  // Signal 1+2: combined per lead_type, OR both addresses already on this row.
  let treatAsCombined = typeIsCombined || (!!purchase && !!selling);

  const needsFamilyLookup =
    lead.id !== undefined && lead.id !== null &&
    (!treatAsCombined || !purchase || !selling);

  if (needsFamilyLookup && lead.id) {
    const rootLeadId = lead.parent_lead_id ?? lead.id;
    const { data: family } = await supabaseAdmin
      .from("leads")
      .select(
        "id, parent_lead_id, lead_type, address_street, address_city, address_province, address_postal_code, selling_address_street, selling_address_city, selling_address_province, selling_address_postal_code",
      )
      .or(`id.eq.${rootLeadId},parent_lead_id.eq.${rootLeadId}`);

    if (family && family.length > 0) {
      // Signal 3: detect P&S from the family if we haven't already.
      if (!treatAsCombined) {
        const familyHasCombinedSibling = family.some((s) => {
          const t = (s.lead_type ?? "").toLowerCase();
          return t.includes("purchase") && t.includes("sale");
        });
        const familyHasPurchaseAddr = family.some((s) =>
          !!joinAddress([
            s.address_street,
            s.address_city,
            s.address_province,
            s.address_postal_code,
          ]),
        );
        const familyHasSellingAddr = family.some((s) =>
          !!joinAddress([
            s.selling_address_street,
            s.selling_address_city,
            s.selling_address_province,
            s.selling_address_postal_code,
          ]),
        );
        if (
          familyHasCombinedSibling ||
          (familyHasPurchaseAddr && familyHasSellingAddr)
        ) {
          treatAsCombined = true;
        }
      }

      // Backfill missing side(s) from family — runs for both combined and
      // sale-only leads.
      const wantsBackfill = treatAsCombined || (typeIsSaleOnly && !selling);
      if (wantsBackfill) {
        for (const sib of family) {
          if (!purchase) {
            const candidate = joinAddress([
              sib.address_street,
              sib.address_city,
              sib.address_province,
              sib.address_postal_code,
            ]);
            if (candidate) purchase = candidate;
          }
          if (!selling) {
            const candidate = joinAddress([
              sib.selling_address_street,
              sib.selling_address_city,
              sib.selling_address_province,
              sib.selling_address_postal_code,
            ]);
            if (candidate) selling = candidate;
          }
          if (purchase && selling) break;
        }
      }
    }
  }

  if (treatAsCombined) {
    return {
      combinedString: [purchase, selling].filter(Boolean).join(" and "),
      purchase,
      selling,
      isCombined: Boolean(purchase && selling),
    };
  }
  if (typeIsSaleOnly) {
    return { combinedString: selling || purchase, purchase, selling, isCombined: false };
  }
  return { combinedString: purchase, purchase, selling, isCombined: false };
}
