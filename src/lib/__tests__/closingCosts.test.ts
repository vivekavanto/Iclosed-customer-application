// Unit tests for the purchase closing-cost maths. Run with:  npm test
//
// ⚠️ TWIN SUITE. The same cases run in the admin repo at
//    d:\iclosed_dev_admin\tests\closingCosts.test.ts
// against its copy of src/lib/closingCosts.ts. That is how a one-sided edit to
// the twin module gets caught: change the maths in one repo and the OTHER
// repo's suite goes red.
//
// The admin repo runs these under node:test; this repo runs them under Jest, so
// the assertions are written in Jest style. The CASES and the expected figures
// must stay identical — every number below comes from the requirements
// document's worked examples or the approved mock-up.
import {
  CALC_VERSION,
  DEFAULT_RATES,
  computeStatement,
  formatRatePercent,
  isTierArray,
  provincialLTT,
  ratesFromConfigRow,
  round2,
  titlePremiumEstimate,
  torontoMLTT,
  type ClosingCostInputs,
  type Statement,
} from "../closingCosts";

// ── helpers ────────────────────────────────────────────────────────────
/** Flat map of line key → amount across every group. */
function lines(s: Statement): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of s.groups) for (const l of g.lines) out[l.key] = l.amount;
  return out;
}

function lineKeys(s: Statement): string[] {
  return s.groups.flatMap((g) => g.lines.map((l) => l.key));
}

function findLine(s: Statement, key: string) {
  return s.groups.flatMap((g) => g.lines).find((l) => l.key === key);
}

/** The mock-up's reference file: $1.08M, $50k down, $399,700 mortgage. */
const REFERENCE: ClosingCostInputs = {
  price: 1_080_000,
  deposit: 50_000,
  mortgage: 399_700,
  isToronto: false,
  isFirstTimeBuyer: false,
};

// ── round2 ─────────────────────────────────────────────────────────────
test("round2: half away from zero, cents precision", () => {
  expect(round2(232.492)).toBe(232.49);
  expect(round2(160.992)).toBe(160.99);
  expect(round2(12.345)).toBe(12.35);
  expect(round2(-12.345)).toBe(-12.35);
  expect(round2(0.13 * 1788.4)).toBe(232.49);
  expect(round2(0)).toBe(0);
  expect(round2(Number.NaN)).toBe(0);
  expect(round2(Infinity)).toBe(0);
});

// ── Ontario provincial LTT (marginal tiers) ────────────────────────────
test("provincialLTT: tier boundaries", () => {
  expect(provincialLTT(0)).toBe(0);
  expect(provincialLTT(-100)).toBe(0);
  expect(provincialLTT(55_000)).toBe(275);
  expect(provincialLTT(250_000)).toBe(2225);
  expect(provincialLTT(400_000)).toBe(4475);
  expect(provincialLTT(2_000_000)).toBe(36_475);
  expect(provincialLTT(2_500_000)).toBe(48_975);
});

test("provincialLTT: the document's worked example", () => {
  // 275 + 1,950 + 2,250 + 13,600 = 18,075.00
  expect(provincialLTT(1_080_000)).toBe(18_075);
});

// ── Toronto municipal LTT ──────────────────────────────────────────────
test("torontoMLTT: identical to provincial at or below $2M", () => {
  for (const p of [0, 55_000, 250_000, 400_000, 1_080_000, 2_000_000]) {
    expect(torontoMLTT(p)).toBe(provincialLTT(p));
  }
});

test("torontoMLTT: still equal to provincial through $3M", () => {
  // The provincial table's top open-ended band is 2.5%, which is exactly
  // Toronto's $2M–$3M band. They only diverge ABOVE $3M, where Toronto's
  // luxury tiers start. Anyone "fixing" this should change the test, not the
  // brackets.
  expect(torontoMLTT(2_500_000)).toBe(provincialLTT(2_500_000));
  expect(torontoMLTT(3_000_000)).toBe(provincialLTT(3_000_000));
  expect(torontoMLTT(4_000_000)).toBeGreaterThan(provincialLTT(4_000_000));
  expect(torontoMLTT(25_000_000)).toBeGreaterThan(provincialLTT(25_000_000));
});

test("torontoMLTT: luxury tiers above $2M", () => {
  expect(torontoMLTT(3_000_000)).toBe(61_475);
  expect(torontoMLTT(4_000_000)).toBe(96_475);
  expect(torontoMLTT(5_000_000)).toBe(141_475);
  expect(torontoMLTT(10_000_000)).toBe(416_475);
  expect(torontoMLTT(20_000_000)).toBe(1_066_475);
  expect(torontoMLTT(25_000_000)).toBe(1_441_475);
});

// ── FCT title premium ──────────────────────────────────────────────────
test("titlePremiumEstimate: linear above the floor, floored below", () => {
  expect(titlePremiumEstimate(0)).toBe(0);
  expect(titlePremiumEstimate(-5)).toBe(0);
  // 250 + 1,080,000 × 0.0785% = 250 + 847.80
  expect(round2(titlePremiumEstimate(1_080_000))).toBe(1097.8);
  // 250 + 39.25 = 289.25 → floored at the 300 minimum premium
  expect(titlePremiumEstimate(50_000)).toBe(300);

  // The floor stops engaging at price = (300 − 250) / 0.000785 ≈ $63,694.27.
  expect(titlePremiumEstimate(63_000)).toBe(300);
  expect(round2(titlePremiumEstimate(64_000))).toBe(300.24);
  expect(titlePremiumEstimate(70_000)).toBeGreaterThan(300);
  expect(round2(titlePremiumEstimate(70_000))).toBe(304.95);
});

// ── First-time buyer rebates ───────────────────────────────────────────
test("rebates: none unless first-time buyer", () => {
  const s = computeStatement(REFERENCE);
  expect(s.detail.ontarioRebate).toBe(0);
  expect(s.detail.torontoRebate).toBe(0);
  expect(lineKeys(s)).not.toContain("rebate_ontario");
  expect(lineKeys(s)).not.toContain("rebate_toronto");
});

test("rebates: Ontario only outside Toronto", () => {
  const s = computeStatement({ ...REFERENCE, isFirstTimeBuyer: true });
  expect(s.detail.ontarioRebate).toBe(4000);
  expect(s.detail.torontoRebate).toBe(0);
  expect(lines(s).rebate_ontario).toBe(-4000);
  expect(lineKeys(s)).not.toContain("rebate_toronto");
});

test("rebates: both in Toronto, each capped", () => {
  const s = computeStatement({
    ...REFERENCE,
    isToronto: true,
    isFirstTimeBuyer: true,
  });
  expect(s.detail.ontarioRebate).toBe(4000);
  expect(s.detail.torontoRebate).toBe(4475);
  expect(lines(s).rebate_ontario).toBe(-4000);
  expect(lines(s).rebate_toronto).toBe(-4475);
  // netLTT = 18,075 + 18,075 − 4,000 − 4,475
  expect(s.detail.netLTT).toBe(27_675);
});

test("rebates: capped by the tax itself on a cheap property", () => {
  // A $150,000 purchase pays only 1,225 in provincial LTT, so the rebate can
  // never exceed that — it reduces the tax, it is not a cash payment.
  const s = computeStatement({
    price: 150_000,
    deposit: 0,
    mortgage: 0,
    isToronto: true,
    isFirstTimeBuyer: true,
  });
  expect(s.detail.provincialLTT).toBe(1225);
  expect(s.detail.ontarioRebate).toBe(1225);
  expect(s.detail.torontoRebate).toBe(1225);
  expect(s.detail.netLTT).toBe(0);
});

// ── The reference statement (mock-up figures, to the cent) ─────────────
test("computeStatement: the reference file matches the mock-up exactly", () => {
  const s = computeStatement(REFERENCE);
  const l = lines(s);

  expect(l.ltt_provincial).toBe(18_075);
  expect(l.title_premium).toBe(1097.8);
  // Billed separately from the legal fee, under Title Insurance.
  expect(l.title_submission).toBe(150);
  expect(l.reg_transfer).toBe(85);
  expect(l.reg_mortgage).toBe(85);
  expect(l.teraview).toBe(54.8);
  expect(l.sheriff).toBe(133.6);
  expect(l.legal_fees).toBe(1200);
  expect(l.admin_fee).toBe(250);

  // HST on the firm's own supplies only — legal + title submission + admin +
  // Teraview + Sheriff: 13% × 1,788.40. Splitting the title-submission charge
  // out of the legal-fees LINE did not take it out of the BASE.
  expect(s.detail.taxableBase).toBe(1788.4);
  expect(s.hst.amount).toBe(232.49);

  expect(s.total).toBe(21_363.69);
  expect(s.balance.balanceDue).toBe(651_663.69);
});

test("computeStatement: printed lines sum to the printed total", () => {
  // The whole point of rounding each line and summing the rounded values.
  const cases: ClosingCostInputs[] = [
    REFERENCE,
    { ...REFERENCE, isToronto: true, isFirstTimeBuyer: true },
    { ...REFERENCE, mortgage: 0 },
    {
      price: 333_333.33,
      deposit: 11_111.11,
      mortgage: 222_222.22,
      isToronto: true,
      isFirstTimeBuyer: false,
    },
  ];

  for (const inputs of cases) {
    const s = computeStatement(inputs);
    const sum = round2(
      s.groups.reduce((acc, g) => acc + g.lines.reduce((a, x) => a + x.amount, 0), 0) +
        s.hst.amount,
    );
    expect(sum).toBe(s.total);

    const balance = round2(
      s.balance.purchasePrice -
        s.balance.depositPaid -
        s.balance.mortgageAmount +
        s.balance.closingCosts +
        s.balance.propertyTaxAdjustment,
    );
    expect(balance).toBe(s.balance.balanceDue);
  }
});

// ── Cash purchase behaviour ────────────────────────────────────────────
test("computeStatement: cash purchase drops both mortgage items", () => {
  const s = computeStatement({ ...REFERENCE, mortgage: 0 });
  const l = lines(s);

  // "Registration of Mortgage" is gone entirely, not zeroed
  expect(lineKeys(s)).not.toContain("reg_mortgage");
  // Legal fees fall to the transfer alone
  expect(l.legal_fees).toBe(650);
  expect(findLine(s, "legal_fees")?.sublabel).toBe("purchase");
  // Title submission is unaffected by there being no mortgage
  expect(l.title_submission).toBe(150);
  // HST base = 650 + 150 + 250 + 54.80 + 133.60 = 1,238.40 → 13% = 160.992
  expect(s.detail.taxableBase).toBe(1238.4);
  expect(s.hst.amount).toBe(160.99);
  expect(s.total).toBe(20_657.19);
  expect(s.balance.balanceDue).toBe(1_050_657.19);
});

// ── Toronto toggle ─────────────────────────────────────────────────────
test("computeStatement: municipal LTT line only in Toronto", () => {
  const outside = computeStatement(REFERENCE);
  expect(lineKeys(outside)).not.toContain("ltt_municipal");
  expect(outside.detail.municipalLTT).toBe(0);

  const inside = computeStatement({ ...REFERENCE, isToronto: true });
  expect(lines(inside).ltt_municipal).toBe(18_075);
  expect(round2(inside.total - outside.total)).toBe(18_075);
});

// ── Title premium override ─────────────────────────────────────────────
test("computeStatement: override is used verbatim and drops the ESTIMATE badge", () => {
  const estimated = computeStatement(REFERENCE);
  expect(findLine(estimated, "title_premium")?.badge).toBe("ESTIMATE");
  expect(estimated.detail.titlePremiumIsEstimate).toBe(true);

  const overridden = computeStatement({ ...REFERENCE, titlePremiumOverride: 950 });
  expect(lines(overridden).title_premium).toBe(950);
  expect(findLine(overridden, "title_premium")?.badge).toBeUndefined();
  expect(overridden.detail.titlePremiumIsEstimate).toBe(false);
  // HST is NOT charged on the title premium, so the total moves by exactly the
  // premium difference.
  expect(round2(estimated.total - overridden.total)).toBe(round2(1097.8 - 950));

  // An explicit zero is a real override, not "fall back to the estimate".
  const zeroed = computeStatement({ ...REFERENCE, titlePremiumOverride: 0 });
  expect(lines(zeroed).title_premium).toBe(0);
  expect(zeroed.detail.titlePremiumIsEstimate).toBe(false);

  expect(
    computeStatement({ ...REFERENCE, titlePremiumOverride: null }).detail
      .titlePremiumIsEstimate,
  ).toBe(true);
});

// ── Group ordering & structure ─────────────────────────────────────────
test("computeStatement: four groups in the required order", () => {
  const s = computeStatement(REFERENCE);
  expect(s.groups.map((g) => g.key)).toEqual([
    "ltt",
    "title",
    "third_party",
    "legal",
  ]);
  expect(s.groups.map((g) => g.title)).toEqual([
    "Land Transfer Tax",
    "Title Insurance",
    "Third-Party Disbursements",
    "Legal & Admin Fees",
  ]);
  expect(s.calcVersion).toBe(CALC_VERSION);
  expect(s.hst.label).toBe("HST @ 13% on taxable fees & disbursements");
});

// ── Property tax adjustment (Statement of Adjustments) ────────────────
// It is NOT a fee, so it must stay out of "Total closing costs" and be added to
// the balance on its own. Getting this backwards overstates the firm's account.
test("propertyTaxAdjustment: omitted entirely when zero or absent", () => {
  for (const value of [undefined, null, 0]) {
    const s = computeStatement({ ...REFERENCE, propertyTaxAdjustment: value });
    expect(s.propertyTax).toBeNull();
    expect(s.balance.propertyTaxAdjustment).toBe(0);
    expect(s.groups).toHaveLength(4);
  }
});

test("propertyTaxAdjustment: excluded from the total, added to the balance", () => {
  const base = computeStatement(REFERENCE);
  const withTax = computeStatement({ ...REFERENCE, propertyTaxAdjustment: 1_250 });

  expect(withTax.total).toBe(base.total);
  expect(withTax.groups.map((g) => g.key)).toEqual(base.groups.map((g) => g.key));
  expect(withTax.propertyTax?.amount).toBe(1_250);
  expect(withTax.balance.propertyTaxAdjustment).toBe(1_250);
  expect(withTax.balance.balanceDue).toBe(base.balance.balanceDue + 1_250);
});

test("propertyTaxAdjustment: a negative figure credits the buyer", () => {
  const base = computeStatement(REFERENCE);
  const credited = computeStatement({ ...REFERENCE, propertyTaxAdjustment: -400 });

  expect(credited.propertyTax?.amount).toBe(-400);
  expect(credited.balance.balanceDue).toBe(base.balance.balanceDue - 400);
  expect(credited.total).toBe(base.total);
});

// ── Degenerate input ───────────────────────────────────────────────────
test("computeStatement: zero price yields a zero-ish statement, not NaN", () => {
  const s = computeStatement({
    price: 0,
    deposit: 0,
    mortgage: 0,
    isToronto: false,
    isFirstTimeBuyer: false,
  });
  expect(Number.isFinite(s.total)).toBe(true);
  expect(Number.isFinite(s.balance.balanceDue)).toBe(true);
  expect(s.balance.purchasePrice).toBe(0);
  expect(s.balance.depositPaid).toBe(0);
  expect(s.balance.mortgageAmount).toBe(0);
});

// ── Config-row mapping ─────────────────────────────────────────────────
test("ratesFromConfigRow: falls back per-field and coerces numeric strings", () => {
  expect(ratesFromConfigRow(null)).toEqual(DEFAULT_RATES);
  expect(ratesFromConfigRow({})).toEqual(DEFAULT_RATES);

  // Supabase returns numerics as strings.
  const mapped = ratesFromConfigRow({ admin_fee: "275", hst_rate: "0.13" });
  expect(mapped.adminFee).toBe(275);
  expect(mapped.hstRate).toBe(0.13);
  // Untouched fields keep the defaults.
  expect(mapped.legalTransfer).toBe(DEFAULT_RATES.legalTransfer);

  // A malformed bracket table falls back rather than producing nonsense tax.
  expect(ratesFromConfigRow({ ltt_tiers: "not-an-array" }).lttTiers).toEqual(
    DEFAULT_RATES.lttTiers,
  );
});

test("isTierArray: guards the bracket-table shape", () => {
  expect(isTierArray([[55_000, 0.005], [null, 0.025]])).toBe(true);
  expect(isTierArray([])).toBe(false);
  expect(isTierArray("nope")).toBe(false);
  expect(isTierArray([[55_000]])).toBe(false);
  expect(isTierArray([["55000", 0.005]])).toBe(false);
});

test("formatRatePercent: trims trailing zeros", () => {
  expect(formatRatePercent(0.13)).toBe("13%");
  expect(formatRatePercent(0.125)).toBe("12.5%");
});
