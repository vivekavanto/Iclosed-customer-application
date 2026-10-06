// Purchase property type, chosen at intake.
export const PROPERTY_TYPES = [
  { value: "new_build_condo", label: "New build condo" },
  { value: "resale_condo", label: "Resale condo" },
  { value: "freehold", label: "Freehold" },
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number]["value"];

export function parsePropertyType(raw: unknown): PropertyType | null {
  return PROPERTY_TYPES.some((t) => t.value === raw) ? (raw as PropertyType) : null;
}

/** FCT prices both condo types at the condo rate. */
export function isCondo(type: PropertyType | null | undefined): boolean {
  return type === "new_build_condo" || type === "resale_condo";
}
