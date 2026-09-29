import {
  buildRetainerAgreement,
  retainerAgreementHst,
  retainerAgreementKind,
  type RetainerAgreementData,
} from "../retainerAgreement";

const base: RetainerAgreementData = {
  kind: "purchase",
  firmKey: "navawilson",
  property: "424 Calderstone Crescent, Toronto",
  fileNo: null,
  legalFees: 1199,
  discount: null,
  disbursements: 673.4,
  taxableDisbursements: 588.4,
  hstRate: 0.13,
  hstNumber: "829252303RT0001",
};

describe("purchase retainer agreement", () => {
  it("applies to single-side purchases and sales only", () => {
    expect(retainerAgreementKind("Purchase")).toBe("purchase");
    expect(retainerAgreementKind("Sale")).toBe("sale");
    expect(retainerAgreementKind("Purchase & Sale")).toBeNull();
    expect(retainerAgreementKind("Refinance")).toBeNull();
  });

  it("charges HST on legal fees and taxable disbursements only", () => {
    // 0.13 × (1199 + 588.40)
    expect(retainerAgreementHst(base)).toBe(232.36);
    // 0.13 × (1199 - 100 + 588.40)
    expect(retainerAgreementHst({ ...base, discount: 100 })).toBe(219.36);
  });

  it("hides file number and discount when absent", () => {
    const a = buildRetainerAgreement(base, "2026-09-29");
    expect(a.meta.join(" ")).not.toContain("File");
    expect(a.fees.map((f) => f.label)).not.toContain("Discount");
    expect(a.meta).toContain("29 September 2026");
    expect(a.meta).toContain("Nava Wilson PC, operating as iClosed");
  });

  it("shows file number and discount when present", () => {
    const a = buildRetainerAgreement({ ...base, fileNo: "26P-0411", discount: 100 }, "2026-09-29");
    expect(a.meta).toContain("File 26P-0411");
    expect(a.fees.find((f) => f.label === "Discount")?.amount).toBe("-$100.00");
    expect(a.feeNote).toContain("HST registration 829252303RT0001.");
  });

  it("uses sale wording, fees and changes for a sale", () => {
    const sale: RetainerAgreementData = {
      ...base,
      kind: "sale",
      legalFees: 1099,
      disbursements: 438.4,
      taxableDisbursements: 438.4,
    };
    const a = buildRetainerAgreement(sale, "2026-09-29");
    expect(a.title).toBe("Sale Retainer Agreement");
    expect(a.meta[0]).toBe("Sale");
    expect(a.fees.map((f) => f.label)).toEqual([
      "Legal fees (including first mortgage, property tax and commission payout)",
      "Disbursements",
      "HST",
    ]);
    // 0.13 × (1099 + 438.40)
    expect(a.fees[2].amount).toBe("$199.86");
    expect(a.changes.map((c) => c.label)).toContain("Sale price over $1.5M");
    expect(a.acceptance).not.toContain("title insurance");
  });
});
