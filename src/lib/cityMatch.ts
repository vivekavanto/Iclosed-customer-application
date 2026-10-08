import { TORONTO_MUNICIPALITIES } from "@/lib/isTorontoAddress";

// Communities amalgamated into each city, as they appear in addresses.
const CITY_PARTS: Record<string, readonly string[]> = {
  toronto: TORONTO_MUNICIPALITIES,
  hamilton: ["hamilton", "ancaster", "dundas", "flamborough", "glanbrook", "stoney creek", "waterdown", "binbrook"],
  ottawa: [
    "ottawa", "kanata", "nepean", "orleans", "orléans", "gloucester", "barrhaven",
    "stittsville", "vanier", "cumberland", "manotick", "osgoode", "goulbourn",
  ],
};

/** True when the city is in one of these cities. */
export function cityIn(city: string | null | undefined, cities: string[]): boolean {
  const c = (city ?? "").trim().toLowerCase();
  if (!c) return false;
  return cities.some((name) => (CITY_PARTS[name.toLowerCase()] ?? [name.toLowerCase()]).includes(c));
}
