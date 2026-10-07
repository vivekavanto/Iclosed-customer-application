// Spec section 11 cases, against the real src/config/iclosed-fees.yaml.
import { bundleDiscountSide, computeBundle, computeFees, dollars, millions } from "../iclosedFees";
import { loadIclosedFees } from "../loadIclosedFees";
import {
  buildRetainerAgreement,
  retainerAgreementKind,
  retainerAgreementPlans,
  type RetainerAgreementInput,
} from "../retainerAgreement";

const fees = loadIclosedFees();

describe("computeFees (spec 5.1–5.3)", () => {
  it("T1: standard purchase with one mortgage", () => {
    expect(computeFees(fees, "purchase")).toMatchObject({
      legalFees: 1199,
      discount: 0,
      disbursements: 715,
      hst: 203.97,
      total: 2117.97,
    });
  });

  it("T2: purchase without a mortgage drops charge registration", () => {
    const f = computeFees(fees, "purchase", { hasMortgage: false });
    expect(f.disbursements).toBe(630);
    expect(f.hst).toBe(203.97);
    expect(f.total).toBe(2032.97);
  });

  it("T5: standard sale, levy inclusive of tax", () => {
    expect(computeFees(fees, "sale")).toMatchObject({ legalFees: 1099, disbursements: 485, hst: 197.47, total: 1781.47 });
  });

  it("T6: sale with two extra payouts", () => {
    expect(computeFees(fees, "sale", { extraPayouts: 2 })).toMatchObject({ legalFees: 1299, hst: 223.47, total: 2007.47 });
  });

  it("T7: standard refinance", () => {
    const f = computeFees(fees, "refinance");
    expect(f).toMatchObject({ legalFees: 999, disbursements: 655, hst: 184.47, total: 1838.47 });
    expect(f.legalFees + f.disbursements).toBe(1654);
    expect(fees.file_types.refinance.title_insurance_estimate).toBe(250);
  });

  // Spec T8 says $765; its own $85 fee gives $740.
  it("T8: refinance with a discharge registration", () => {
    expect(computeFees(fees, "refinance", { dischargeRegistration: true })).toMatchObject({
      disbursements: 740,
      hst: 184.47,
      total: 1923.47,
    });
  });

  it("T9: new build condo quote total excludes the agreement review", () => {
    const f = computeFees(fees, "new_build_condo");
    expect(f.legalFees + f.disbursements).toBe(2414);
    expect(f.hst).toBe(268.97);
  });

  it("T15: sale title search adds a pass-through disbursement", () => {
    expect(computeFees(fees, "sale", { sellerTitleSearch: true })).toMatchObject({
      disbursements: 535,
      hst: 197.47,
      total: 1831.47,
    });
    expect(computeFees(fees, "purchase", { sellerTitleSearch: true }).disbursements).toBe(715);
  });

  it("T10: purchase with a $100 discount taxes the discounted fee", () => {
    expect(computeFees(fees, "purchase", { discount: 100 })).toMatchObject({ hst: 190.97, total: 2004.97 });
  });

  it("T11: purchase with two mortgages", () => {
    expect(computeFees(fees, "purchase", { chargesCount: 2 })).toMatchObject({ disbursements: 800, total: 2202.97 });
  });

  it("formats fee text", () => {
    expect(dollars(250)).toBe("$250");
    expect(millions(1_500_000)).toBe("$1.5M");
    expect(millions(3_000_000)).toBe("$3M");
  });
});

describe("retainer agreement (spec 8)", () => {
  const base: RetainerAgreementInput = {
    kind: "purchase",
    firmKey: "navawilson",
    property: "424 Calderstone Crescent, Toronto, Ontario M1C 3A7",
    fileNo: null,
    discount: null,
    date: "2026-09-29",
  };

  it("applies to single-side purchases, sales and refinances", () => {
    expect(retainerAgreementKind("Purchase")).toBe("purchase");
    expect(retainerAgreementKind("Sale")).toBe("sale");
    expect(retainerAgreementKind("Refinance")).toBe("refinance");
    expect(retainerAgreementKind("Purchase & Sale")).toBeNull();
    expect(retainerAgreementKind("Condo")).toBeNull();
  });

  it("T13: subtitle omits the file number when absent", () => {
    const a = buildRetainerAgreement(fees, base);
    expect(a.meta).toEqual([
      "424 Calderstone Crescent, Toronto, Ontario M1C 3A7",
      "29 September 2026",
      "iClosed, powered by Nava Wilson PC",
    ]);
    expect(buildRetainerAgreement(fees, { ...base, fileNo: "26P-0411" }).meta[1]).toBe("File 26P-0411");
  });

  it("purchase fee table always shows the discount row", () => {
    const a = buildRetainerAgreement(fees, base);
    expect(a.fees).toEqual([
      { label: "Legal fees (for title transfer and mortgage)", amount: "$1,199.00" },
      { label: "Estimated Disbursements (average is $650-$750)", amount: "$715.00" },
      { label: "HST", amount: "$203.97" },
    ]);
    const discounted = buildRetainerAgreement(fees, { ...base, discount: 100 });
    expect(discounted.fees[1].amount).toBe("($100.00)");
    expect(discounted.fees[3].amount).toBe("$190.97");
    expect(a.feeNote).toMatch(/HST registration 829252303RT0001\.$/);
    const noNumber = { ...fees, retainer: { hst_registration_number: null } };
    expect(buildRetainerAgreement(noNumber, base).feeNote).toMatch(/HST registration \[number\]\.$/);
  });

  it("purchase extras and definitions follow the fee settings", () => {
    const a = buildRetainerAgreement(fees, base);
    expect(a.changes).toEqual([
      { label: "If you require the closing date to be moved", amount: "$250 per extension request" },
      { label: "Mortgage instructions arrive under 3 business days of closing", amount: "$200" },
      { label: "Each payout beyond the one in your fee", amount: "$100" },
      { label: "Notice of Assignment of Rents required ($85 is paid to the ministry)", amount: "$150 plus $85 registration" },
      { label: "Bridge financing", amount: "$200" },
      { label: "Your mortgage is not from a major bank", amount: "$250" },
      { label: "Purchase price over $1.5M", amount: "$300, or quoted above $3M" },
      { label: "Tax Certificate from the Municipality (paid to Municipality)", amount: "Approx $100" },
    ]);
    expect(a.definitions.map((d) => d.label)).toEqual([
      "Title Insurance.",
      "Mortgage not from a major bank.",
      "Notice of Assignment of Rents.",
      "Mortgage Instructions.",
    ]);
  });

  it("purchase copy follows the v11 template", () => {
    const a = buildRetainerAgreement(fees, base);
    const body = (label: string) => a.sections.find((s) => s.label === label)?.body;
    expect(body("What we do.")).toContain("notify the municipality that you have purchased your property");
    expect(body("What we do not do.")).toContain("family law matters");
    expect(body("Independent legal advice.")).toMatch(/\$250 to \$450 plus HST\.$/);
    expect(body("Ending this retainer.")).toContain("If the relationship ends");
    expect(a.feeNote).toMatch(/^Land transfer tax and your title insurance premium are based on the purchase price/);
  });

  it("sale uses its own fees and extras, with no definitions", () => {
    const a = buildRetainerAgreement(fees, { ...base, kind: "sale" });
    expect(a.title).toBe("Sale Retainer Agreement");
    expect(a.fees.map((f) => f.amount)).toEqual(["$1,099.00", "$485.00", "$197.47"]);
    expect(a.fees[1].label).toBe("Estimated Disbursements");
    expect(a.changes).toEqual([
      { label: "If you require the closing date to be moved", amount: "$250 per extension request" },
      { label: "Each payout beyond first mortgage, property tax and commission", amount: "$100" },
      {
        label: "No requisition letter (Title Search) from the buyer's lawyer 7 days before closing, so we search title ourselves ($40 to $75)",
        amount: "Approx $50",
      },
      { label: "Sale price over $1.5M", amount: "$300, or quoted above $3M" },
    ]);
    expect(a.definitions).toEqual([]);
    expect(a.feeNote).toMatch(/^Our fees come out of your sale proceeds/);
    expect(a.sections.find((s) => s.label === "Ending this retainer.")?.body).toContain("end this relationship in writing");
    expect(a.sections.find((s) => s.label === "Your information.")?.body).toContain("the buyer's lawyer");
  });

  it("refinance follows the v11 template", () => {
    const a = buildRetainerAgreement(fees, { ...base, kind: "refinance" });
    expect(a.title).toBe("Refinance Retainer Agreement");
    expect(a.fees).toEqual([
      { label: "Legal fees (including first mortgage payout)", amount: "$999.00" },
      { label: "Estimated Disbursements (average is $650-$750)", amount: "$655.00" },
      { label: "HST", amount: "$184.47" },
    ]);
    expect(a.changes).toEqual([
      { label: "Closing date moves and documents must be redrafted", amount: "$250 per extension request" },
      { label: "Mortgage instructions arrive under 3 business days of closing", amount: "$200" },
      { label: "Each payout beyond the one in your fee", amount: "$100" },
      { label: "Notice of Assignment of Rents required ($85 is paid to the ministry)", amount: "$150 plus $85 registration" },
      { label: "Your mortgage is not from a major bank", amount: "$250" },
      { label: "Mortgage amount over $1.5M", amount: "$300, or quoted above $3M" },
      { label: "Your existing lender asks us to register the discharge ($85 is paid to the ministry)", amount: "$85" },
      { label: "For private lenders, preparing the discharge documents", amount: "$450" },
    ]);
    expect(a.definitions.map((d) => d.label)).toEqual([
      "Title Insurance.",
      "Mortgage not from a major bank.",
      "Notice of Assignment of Rents.",
      "Mortgage Instructions.",
    ]);
    expect(a.changesIntro).not.toContain("private or B lender");
    expect(a.feeNote).toMatch(/^Your lender's title insurance premium is not included/);
    expect(a.sections.find((s) => s.label === "Your information.")?.body).toContain("your mortgage broker");
  });

  it("never renders internal notes", () => {
    const text = JSON.stringify(
      (["purchase", "sale", "refinance"] as const).map((kind) => buildRetainerAgreement(fees, { ...base, kind })),
    );
    expect(text).not.toMatch(/Discuss internally|Discuss with Angat|only when one is applied/);
  });
});

describe("sale and purchase bundle (spec 5.3a, 7A)", () => {
  it("T16: purchase closes later and takes the discount", () => {
    const b = computeBundle(fees, { saleClosing: "2026-11-27", purchaseClosing: "2026-11-30" });
    expect(b.discountSide).toBe("purchase");
    expect(b.purchase.legalFees - b.purchase.discount).toBe(1099);
    expect(b.purchase).toMatchObject({ hst: 190.97, total: 2004.97 });
    expect(b.sale).toMatchObject({ legalFees: 1099, discount: 0, hst: 197.47, total: 1781.47 });
    expect([b.legalFees, b.disbursements, b.legalFees + b.disbursements]).toEqual([2198, 1200, 3398]);
  });

  it("T17: purchase closes first, so the sale takes the discount", () => {
    const b = computeBundle(fees, { saleClosing: "2026-11-30", purchaseClosing: "2026-11-27" });
    expect(b.discountSide).toBe("sale");
    expect(b.sale.legalFees - b.sale.discount).toBe(999);
    expect(b.sale).toMatchObject({ hst: 184.47, total: 1668.47 });
    expect(b.purchase).toMatchObject({ hst: 203.97, total: 2117.97 });
    expect(Math.round((b.sale.total + b.purchase.total) * 100) / 100).toBe(3786.44);
  });

  it("T18: same day, or an unknown date, goes to the purchase", () => {
    expect(bundleDiscountSide("2026-11-30", "2026-11-30")).toBe("purchase");
    expect(bundleDiscountSide(null, "2026-11-30")).toBe("purchase");
    expect(bundleDiscountSide("2026-11-30", null)).toBe("purchase");
  });

  const lead = { lead_type: "Purchase & Sale", selling_closing_date: "2026-11-27", closing_date: "2026-11-30" };
  const addresses = { property: "both", purchaseAddress: "1 Buy St", saleAddress: "2 Sell St" };

  it("plans two retainers in closing order, discount on the later file", () => {
    expect(retainerAgreementPlans(lead, addresses)).toEqual([
      { kind: "sale", property: "2 Sell St", bundle: "other" },
      { kind: "purchase", property: "1 Buy St", bundle: "here" },
    ]);
    const flipped = { ...lead, selling_closing_date: "2026-12-05" };
    expect(retainerAgreementPlans(flipped, addresses).map((p) => [p.kind, p.bundle])).toEqual([
      ["purchase", "other"],
      ["sale", "here"],
    ]);
  });

  it("co-persons get only their own side", () => {
    expect(retainerAgreementPlans(lead, { ...addresses, only: "sale" })).toEqual([
      { kind: "sale", property: "2 Sell St", bundle: "other" },
    ]);
    expect(retainerAgreementPlans({ lead_type: "Purchase" }, addresses)).toEqual([
      { kind: "purchase", property: "both", bundle: "none" },
    ]);
  });

  it("v13 bundle paragraph and discount row", () => {
    const base = { firmKey: "navawilson" as const, property: "x", fileNo: null, date: "2026-10-01", bundle: true };
    const purchase = buildRetainerAgreement(fees, { ...base, kind: "purchase", discount: 100 });
    expect(purchase.fees[1].amount).toBe("($100.00)");
    expect(purchase.fees[3].amount).toBe("$190.97");
    expect(purchase.bundleNote).toMatch(/^Because we are closing both.*comes off this purchase\.$/);
    const sale = buildRetainerAgreement(fees, { ...base, kind: "sale", discount: null });
    expect(sale.fees.some((f) => f.label === "Discount")).toBe(false);
    expect(sale.bundleNote).toBe("As we are closing both of your deals, you get a $100 discount on the legal fees of your purchase.");
    expect(buildRetainerAgreement(fees, { ...base, kind: "sale", discount: null, bundle: false }).bundleNote).toBeUndefined();
  });
});
