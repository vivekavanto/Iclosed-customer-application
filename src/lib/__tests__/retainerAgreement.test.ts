// Spec section 11 cases, against the real src/config/iclosed-fees.yaml.
import { computeFees, dollars, millions, type IclosedFees } from "../iclosedFees";
import { loadIclosedFees } from "../loadIclosedFees";
import {
  buildRetainerAgreement,
  retainerAgreementKind,
  type RetainerAgreementInput,
} from "../retainerAgreement";

const fees = loadIclosedFees();

describe("computeFees (spec 5.1–5.3)", () => {
  it("T1: standard purchase with one mortgage", () => {
    expect(computeFees(fees, "purchase")).toEqual({
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

  it("T5: standard sale, levy taxed and not taxed", () => {
    expect(computeFees(fees, "sale")).toMatchObject({ legalFees: 1099, disbursements: 485, hst: 205.92, total: 1789.92 });
    const noLevyHst: IclosedFees = { ...fees, tax: { ...fees.tax, hst_on_levy: false } };
    expect(computeFees(noLevyHst, "sale")).toMatchObject({ hst: 197.47, total: 1781.47 });
  });

  it("T6: sale with two extra payouts", () => {
    expect(computeFees(fees, "sale", { extraPayouts: 2 })).toMatchObject({ legalFees: 1299, hst: 231.92, total: 2015.92 });
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

  it("applies to single-side purchases and sales only", () => {
    expect(retainerAgreementKind("Purchase")).toBe("purchase");
    expect(retainerAgreementKind("Sale")).toBe("sale");
    expect(retainerAgreementKind("Purchase & Sale")).toBeNull();
    expect(retainerAgreementKind("Refinance")).toBeNull();
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
      { label: "Discount", amount: "$0.00" },
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
      { label: "Your mortgage is from a B Lender or Private Lender", amount: "$250" },
      { label: "Purchase price over $1.5M", amount: "$300, or quoted above $3M" },
      { label: "Tax Certificate from the Municipality (paid to Municipality)", amount: "Approx $100" },
    ]);
    expect(a.definitions.map((d) => d.label)).toEqual([
      "Title Insurance.",
      "B Lender or Private Lender.",
      "Notice of Assignment of Rents.",
      "Mortgage Instructions.",
    ]);
  });

  it("sale uses its own fees, extras and single definition", () => {
    const a = buildRetainerAgreement(fees, { ...base, kind: "sale" });
    expect(a.title).toBe("Sale Retainer Agreement");
    expect(a.fees.map((f) => f.amount)).toEqual(["$1,099.00", "$0.00", "$485.00", "$205.92"]);
    expect(a.fees[2].label).toBe("Disbursements");
    expect(a.changes.map((c) => c.label)).toEqual([
      "If you require the closing date to be moved",
      "Each payout beyond first mortgage, property tax and commission",
      "Your mortgage is from a B Lender or Private Lender",
      "Sale price over $1.5M",
    ]);
    expect(a.definitions.map((d) => d.label)).toEqual(["B Lender or Private Lender."]);
    expect(a.sections.find((s) => s.label === "Your information.")?.body).toContain("the buyer's lawyer");
  });

  it("never renders internal notes", () => {
    const text = JSON.stringify([buildRetainerAgreement(fees, base), buildRetainerAgreement(fees, { ...base, kind: "sale" })]);
    expect(text).not.toMatch(/Discuss internally|Discuss with Angat|only when one is applied/);
  });
});
