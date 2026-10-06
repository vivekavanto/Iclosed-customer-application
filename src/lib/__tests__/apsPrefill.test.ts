import { parseApsPayload } from "@/lib/apsExtraction";
import { buildPrefillEntries, formatCurrencyValue } from "@/lib/apsPrefill";

const aps = parseApsPayload({
  is_aps: true,
  document_type: "aps",
  purchase_price: { value: "535000", confidence: "high" },
  deposit: { value: "25000", confidence: "high" },
  closing_date: { value: "2026-10-13", confidence: "high" },
  property_address: { street: "3200 William Coltson Avenue", unit: "407", city: "Oakville", postal_code: "L6H 7W6", confidence: "high" },
  buyers: [], sellers: [], agents: [], reason: "",
})!;

describe("APS prefill", () => {
  it("fills the purchase deposit field", () => {
    const deposit = buildPrefillEntries(aps, "purchase", "buying").find((e) => e.key === "depositAmount");
    expect(deposit?.value).toBe("$25,000");
  });

  it("adds no visible deposit field for a sale", () => {
    expect(buildPrefillEntries(aps, "sale", "selling").some((e) => e.key === "depositAmount")).toBe(false);
  });

  it("keeps cents from turning into extra digits", () => {
    expect(formatCurrencyValue("25000.50")).toBe("$25,001");
    expect(formatCurrencyValue("25000")).toBe("$25,000");
  });
});
