import { cityIn } from "@/lib/cityMatch";

export const VACANT_TAX_CITIES = ["toronto", "hamilton", "ottawa"];

export function isVacantHomeTaxTask(title: string | null | undefined): boolean {
  return (title ?? "").toLowerCase().includes("vacant home tax");
}

/** True when the sale property is in a city with a vacant home tax. */
export function vacantTaxApplies(
  lead: { address_city?: string | null; selling_address_city?: string | null; lead_type?: string | null },
  side: string | null,
): boolean {
  const bundle = (lead.lead_type ?? "").trim() === "Purchase & Sale";
  const city = bundle ? (side === "sale" ? lead.selling_address_city : null) : lead.address_city;
  return cityIn(city, VACANT_TAX_CITIES);
}
