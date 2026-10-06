import { buildPurchaseDraft } from "@/lib/draftStatement";
import { titleInsuranceEstimate } from "@/lib/iclosedFees";
import { loadIclosedFees } from "@/lib/loadIclosedFees";
import { isCondo, parsePropertyType } from "@/lib/propertyType";

describe("property type", () => {
  it("treats both condo types as condo", () => {
    expect(isCondo("new_build_condo")).toBe(true);
    expect(isCondo("resale_condo")).toBe(true);
    expect(isCondo("freehold")).toBe(false);
    expect(parsePropertyType("bungalow")).toBeNull();
  });

  it("prices FCT at the condo or freehold rate", () => {
    const ft = loadIclosedFees().file_types.purchase;
    expect(titleInsuranceEstimate(ft, true)).toBe(1200);
    expect(titleInsuranceEstimate(ft, false)).toBe(1500);
    expect(titleInsuranceEstimate(ft, null)).toBe(1500);
  });

  it("labels the estimate with the property type on screen", () => {
    const d = buildPurchaseDraft(loadIclosedFees(), {
      name: null, property: null, closingDate: null, price: 910000, deposit: 0, propertyTaxAdjustment: 0,
      mortgage: 0, isToronto: false, firstTimeBuyer: false, titlePremium: null, discount: null, propertyType: "resale_condo",
    });
    const line = d.sections.find((s) => s.title === "Title insurance")!.lines[0];
    expect(line.screen?.label).toBe("FCT policy premium (condo), estimate");
    expect(line.amount).toBe("$1,200.00");
    expect(line.label).toBe("FCT policy premium, estimate");
  });
});
