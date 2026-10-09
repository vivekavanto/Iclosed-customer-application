import { isVacantHomeTaxTask, vacantTaxApplies } from "@/lib/vacantHomeTax";

describe("vacant home tax", () => {
  it("applies in Toronto, Hamilton and Ottawa, including former municipalities", () => {
    expect(vacantTaxApplies({ address_city: "North York", lead_type: "Sale" }, null)).toBe(true);
    expect(vacantTaxApplies({ address_city: "Stoney Creek", lead_type: "Sale" }, null)).toBe(true);
    expect(vacantTaxApplies({ address_city: "Kanata", lead_type: "Sale" }, null)).toBe(true);
    expect(vacantTaxApplies({ address_city: "Burlington", lead_type: "Sale" }, null)).toBe(false);
  });

  it("uses the sale address on a Buy & Sell", () => {
    const lead = { address_city: "Burlington", selling_address_city: "Toronto", lead_type: "Purchase & Sale" };
    expect(vacantTaxApplies(lead, "sale")).toBe(true);
    expect(vacantTaxApplies(lead, "purchase")).toBe(false);
  });

  it("matches the task title", () => {
    expect(isVacantHomeTaxTask("Vacant home tax declaration")).toBe(true);
  });
});
