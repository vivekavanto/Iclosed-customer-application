import type { LeadAddressParts } from "@/lib/leadEmailAddress";

/**
 * Rewrites the rendered phrase "Purchase & Sale of <purchase> and <selling>"
 * to "Purchase of <purchase> and Sale of <selling>" so the two sides of a
 * combined deal read distinctly. No-op when the lead isn't a combined
 * Purchase & Sale or either address is missing.
 */
export function splitCombinedAddressPhrase(
  html: string,
  parts: LeadAddressParts,
): string {
  if (!parts.isCombined || !parts.purchase || !parts.selling) return html;

  const combined = `${parts.purchase} and ${parts.selling}`;
  const target = `Purchase & Sale of ${combined}`;
  const replacement = `Purchase of ${parts.purchase} and Sale of ${parts.selling}`;
  return html.split(target).join(replacement);
}
