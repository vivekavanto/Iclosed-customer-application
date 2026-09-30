// Spec section 11 draft cases, against the real src/config/iclosed-fees.yaml.
import { buildPurchaseDraft, landTransferTax, type PurchaseDraftInput } from "../draftStatement";
import { loadIclosedFees } from "../loadIclosedFees";

const fees = loadIclosedFees();

const base: PurchaseDraftInput = {
  name: "Sam Client",
  property: "424 Calderstone Crescent, Toronto",
  closingDate: "2026-11-20",
  price: 910000,
  deposit: 50000,
  propertyTaxAdjustment: 1000,
  mortgage: 700000,
  isToronto: true,
  firstTimeBuyer: true,
  titlePremium: null,
  discount: null,
};

const line = (d: ReturnType<typeof buildPurchaseDraft>, section: string, label: string) =>
  d.sections.find((s) => s.title === section)?.lines.find((l) => l.label === label)?.amount;

describe("landTransferTax (spec 5.5)", () => {
  it("T1: $910,000 in Toronto, first-time buyer", () => {
    expect(landTransferTax(fees, 910000, true, true)).toEqual({
      ontarioTax: 14675,
      ontarioRebate: 4000,
      torontoTax: 14675,
      torontoRebate: 4475,
      adminFee: 115.89,
      total: 20990.89,
    });
  });

  it("T2: $600,000 outside Toronto, not first-time", () => {
    expect(landTransferTax(fees, 600000, false, false).total).toBe(8475);
  });

  it("T3: $1.8M in Toronto", () => {
    const t = landTransferTax(fees, 1800000, true, false);
    expect([t.ontarioTax, t.torontoTax, t.total]).toEqual([32475, 32475, 65065.89]);
  });

  it("T4: $3.5M in Toronto uses the luxury brackets", () => {
    const t = landTransferTax(fees, 3500000, true, false);
    expect([t.ontarioTax, t.torontoTax, t.total]).toEqual([73975, 83475, 157565.89]);
  });
});

describe("buildPurchaseDraft (spec 9)", () => {
  it("T1 figures and funds required", () => {
    const d = buildPurchaseDraft(fees, base);
    expect(d.feesTotal).toBe(2117.97);
    expect(line(d, "Land transfer tax", "Land transfer tax")).toBe("$20,990.89");
    expect(line(d, "Land transfer tax", "Less Ontario first-time buyer rebate")).toBe("($4,000.00)");
    expect(line(d, "Estimated disbursements", "Searches")).toBe("approx. $175.00");
    expect(line(d, "Estimated disbursements", "Estimated total disbursements")).toBe("$715.00");
    expect(line(d, "HST", "HST at 13% on our legal fees and our own disbursements")).toBe("$203.97");
    // 910,000 - 50,000 + 1,000 - 700,000 + 2,117.97 + 20,990.89 + 1,500
    expect(d.fundsRequired).toBe(185608.86);
  });

  it("hides Toronto and rebate lines when they do not apply", () => {
    const d = buildPurchaseDraft(fees, { ...base, isToronto: false, firstTimeBuyer: false });
    const labels = d.sections.find((s) => s.title === "Land transfer tax")!.lines.map((l) => l.label);
    expect(labels).toEqual(["Ontario land transfer tax", "Land transfer tax"]);
  });

  it("cash purchase drops charge registration", () => {
    const d = buildPurchaseDraft(fees, { ...base, mortgage: 0 });
    expect(line(d, "Estimated disbursements", "Registration of charge")).toBeUndefined();
    expect(line(d, "Estimated disbursements", "Estimated total disbursements")).toBe("$630.00");
  });

  it("counts an unanswered mortgage and unknown deposit as $0", () => {
    const d = buildPurchaseDraft(fees, { ...base, mortgage: null, deposit: null });
    expect(line(d, "Funds you need on closing", "Less mortgage advance")).toBe("($0.00)");
    expect(line(d, "Estimated statement of adjustments", "Less deposit")).toBe("($0.00)");
    // Charge registration stays until the client answers 0.
    expect(line(d, "Estimated disbursements", "Estimated total disbursements")).toBe("$715.00");
    // 910,000 + 1,000 + 2,117.97 + 20,990.89 + 1,500
    expect(d.fundsRequired).toBe(935608.86);
  });

  it("shows [Amount] when the property tax adjustment is unknown", () => {
    const d = buildPurchaseDraft(fees, { ...base, propertyTaxAdjustment: null });
    expect(d.fundsRequired).toBeNull();
    expect(line(d, "Funds you need on closing", "Funds required from you")).toBe("[Amount]");
  });

  it("always shows the discount row; T10 discount", () => {
    expect(line(buildPurchaseDraft(fees, base), "Legal fees", "Discount")).toBe("$0.00");
    const d = buildPurchaseDraft(fees, { ...base, discount: 100 });
    expect(line(d, "Legal fees", "Discount")).toBe("($100.00)");
    expect(d.feesTotal).toBe(2004.97);
  });

  it("never renders template-only text", () => {
    expect(JSON.stringify(buildPurchaseDraft(fees, base))).not.toMatch(/Lines marked in red|If this happens|Discuss/);
  });
});
