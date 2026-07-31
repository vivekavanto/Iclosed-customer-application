import supabaseAdmin from "@/lib/supabaseAdmin";

/**
 * Side scoping for a Purchase & Sale family.
 *
 * On a P&S file `convertLead` seeds BOTH sides' milestones and tasks onto EVERY
 * deal in the family — the dashboard then hides the other side's tab per person.
 * That means anything which fans out across the family by deal id (rather than
 * by side) reaches the wrong people. `advanceMilestone` gets this right by
 * matching on `stage_template_id` + `side`, but `triggerMilestoneEmail` only
 * received a milestone id and re-fanned across the whole family, so a
 * purchase-side stage ("Title Search", "Financing Firm -> Mortgage
 * Instructions") emailed the co-sellers too.
 *
 * Deliberately conservative: an unknown side on EITHER end means "no opinion"
 * and we still send. We only suppress when both sides are known and genuinely
 * disagree, so the failure mode is an extra email, never a missing one.
 *
 * Mirror of the admin repo's src/lib/milestoneSide.ts — keep the two in step.
 */

export type Side = "purchase" | "sale";

function leadTypeToSide(rawLeadType: string | null | undefined): Side | null {
  const lt = (rawLeadType ?? "").toLowerCase().trim();
  const isCombined = lt.includes("purchase") && lt.includes("sale");
  if (isCombined) return null;
  if (lt.includes("sale")) return "sale";
  if (lt.includes("purchase")) return "purchase";
  // Refinance, Condo, blank, … — not side-specific.
  return null;
}

/**
 * The side a lead should receive, or null for "both / unknown".
 *
 * The primary client returns null on purpose: on a P&S file they are the
 * purchaser AND the seller, so every milestone concerns them. Primaries are
 * identified by absence — no `parent_lead_id`, no `co_person_role`.
 */
export function recipientSideForLead(
  lead:
    | {
        parent_lead_id?: string | null;
        co_person_role?: string | null;
        lead_type?: string | null;
      }
    | null
    | undefined,
): Side | null {
  if (!lead) return null;
  if (!lead.parent_lead_id) return null; // primary client — both sides

  const role = (lead.co_person_role ?? "").toLowerCase().trim();
  if (role === "purchaser") return "purchase";
  if (role === "seller") return "sale";

  // Legacy co-people predate co_person_role. Intake copies the parent's
  // lead_type verbatim onto co-people, so a combined lead_type tells us
  // nothing — only a single-sided one is a usable signal.
  return leadTypeToSide(lead.lead_type);
}

/**
 * The side a milestone belongs to, or null when it isn't side-specific.
 *
 * `milestones.side` is only written by our converter and only for
 * `Purchase & Sale` deals — the ADMIN app's converter never sets it, so the
 * column is NULL on the majority of rows and filtering on it alone would
 * silently do nothing. The authoritative source is the stage template's
 * `lead_type`; `milestones.side` is only a fast path when present.
 */
export async function resolveMilestoneSide(milestone: {
  side?: string | null;
  stage_template_id?: string | null;
}): Promise<Side | null> {
  const direct = (milestone.side ?? "").toLowerCase().trim();
  if (direct === "purchase" || direct === "sale") return direct;

  if (!milestone.stage_template_id) return null;

  const { data: stage } = await supabaseAdmin
    .from("stage_templates")
    .select("lead_type")
    .eq("id", milestone.stage_template_id)
    .maybeSingle();

  return leadTypeToSide(stage?.lead_type);
}

/** Should this recipient get this milestone's email? */
export function shouldEmailForSide(
  milestoneSide: Side | null,
  recipientSide: Side | null,
): boolean {
  if (!milestoneSide || !recipientSide) return true;
  return milestoneSide === recipientSide;
}
