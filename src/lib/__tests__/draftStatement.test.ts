// Spec section 11 draft cases, against the real src/config/iclosed-fees.yaml.
import {
  buildPurchaseDraft,
  buildRefinanceDraft,
  landTransferTax,
  type PurchaseDraftInput,
  type RefinanceDraftInput,
} from "../draftStatement";
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

  it("uses the v6 labels and notes", () => {
    const d = buildPurchaseDraft(fees, base);
    const lines = d.sections.flatMap((s) => s.lines);
    expect(line(d, "Legal fees", "Purchase legal fees")).toBe("$1,199.00");
    expect(lines.find((l) => l.label === "Searches")?.note).toMatch(/\(Average range is \$150-\$250\)$/);
    expect(lines.find((l) => l.label === "FCT policy premium, estimate")?.note).toMatch(/imposed by your lender\.$/);
    expect(lines.find((l) => l.label === "Funds required from you")?.note).toMatch(/^We will confirm this figure in writing before closing,/);
  });

  it("never renders template-only text", () => {
    expect(JSON.stringify(buildPurchaseDraft(fees, base))).not.toMatch(/Lines marked in red|If this happens|Discuss/);
  });
});

describe("buildRefinanceDraft (spec 9)", () => {
  const refi: RefinanceDraftInput = {
    name: "Sam Client",
    property: "424 Calderstone Crescent, Toronto",
    lender: "Lender Bank",
    closingDate: "2026-11-13",
    mortgageAdvance: 500000,
    existingPayout: 400000,
    titlePremium: null,
    discount: null,
  };
  const at = (d: ReturnType<typeof buildRefinanceDraft>, section: string, label: string) =>
    d.sections.find((s) => s.title === section)?.lines.find((l) => l.label === label)?.amount;

  it("T7 figures, sections and funds to you", () => {
    const d = buildRefinanceDraft(fees, refi);
    expect(d.sections.map((s) => s.title)).toEqual(["Title insurance", "Legal fees", "Disbursements", "HST", "Your funds"]);
    expect(d.details.find((x) => x.label === "New lender")?.value).toBe("Lender Bank");
    expect(at(d, "Title insurance", "FCT lender policy premium, estimate")).toBe("$250.00");
    expect(at(d, "Disbursements", "Searches")).toBe("approx. $150.00");
    expect(at(d, "Disbursements", "Total Disbursements")).toBe("$655.00");
    expect(at(d, "HST", "HST at 13% on our legal fees and our own disbursements")).toBe("$184.47");
    expect(at(d, "Your funds", "Less legal fees, disbursements and HST")).toBe("($1,838.47)");
    // 500,000 - 400,000 - 1,838.47 - 250
    expect(d.fundsToYou).toBe(97911.53);
    expect(d.disclaimer).toMatch(/^This is a draft account/);
  });

  it("shows [Amount] until the advance and payout are known", () => {
    const d = buildRefinanceDraft(fees, { ...refi, mortgageAdvance: null, existingPayout: null, lender: null });
    expect(d.fundsToYou).toBeNull();
    expect(at(d, "Your funds", "New mortgage advance")).toBe("[Amount]");
    expect(at(d, "Your funds", "Less payout of existing mortgage")).toBe("([Amount])");
    expect(d.details.find((x) => x.label === "New lender")?.value).toBe("[Lender]");
  });

  it("T8: discharge registration adds a line", () => {
    const d = buildRefinanceDraft(fees, { ...refi, dischargeRegistration: true });
    expect(at(d, "Disbursements", "Registration of discharge")).toBe("$85.00");
    expect(d.feesTotal).toBe(1923.47);
  });
});
