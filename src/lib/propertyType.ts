// Purchase property type, chosen at intake.
export const PROPERTY_TYPES = [
  { value: "new_build_condo", label: "Condo - New build" },
  { value: "resale_condo", label: "Condo - Resale" },
  { value: "new_build_freehold", label: "Freehold (detached, semi or town house) - New build" },
  { value: "resale_freehold", label: "Freehold (detached, semi or town house) - Resale" },
] as const;

// "freehold" is from leads saved before the new build/resale split.
export type PropertyType = (typeof PROPERTY_TYPES)[number]["value"] | "freehold";

export function parsePropertyType(raw: unknown): PropertyType | null {
  return raw === "freehold" || PROPERTY_TYPES.some((t) => t.value === raw) ? (raw as PropertyType) : null;
}

/** FCT prices both condo types at the condo rate. */
export function isCondo(type: PropertyType | null | undefined): boolean {
  return type === "new_build_condo" || type === "resale_condo";
}
