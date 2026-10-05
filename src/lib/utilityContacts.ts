// Utility contacts by municipality; data from scripts/build-utility-contacts.py.
import data from "./utilityContacts.data.json";

export interface UtilityRow {
  service: string;
  /** Hydro company; absent for municipal tax and water. */
  provider?: string;
  phone: string;
  /** The contact sheet says CLIENT MUST CONTACT. */
  clientCalls: boolean;
  /** Provider depends on the address. */
  verify?: boolean;
}

export interface UtilityMunicipality {
  name: string;
  aliases: string[];
  rows: UtilityRow[];
  /** The municipality takes no notices from law offices. */
  clientContactsAll?: boolean;
}

const MUNICIPALITIES = data as UtilityMunicipality[];

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/^(city|town|township|county|municipality) of\s+/, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ");

/** Contacts for a property city, or null. */
export function utilityContactsFor(city: string | null | undefined): UtilityMunicipality | null {
  const c = normalize(city ?? "");
  if (!c) return null;
  return MUNICIPALITIES.find((m) => m.aliases.some((a) => normalize(a) === c) || normalize(m.name) === c) ?? null;
}
