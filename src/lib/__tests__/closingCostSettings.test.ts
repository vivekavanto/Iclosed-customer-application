// The portal half of the closing-cost settings twin.
//
// `src/lib/closingCostSettings.ts` is a copy of the admin app's module. The
// admin repo's tests/closingCostSettings.test.ts already asserts the invariant
// below — and that is exactly why the admin copy never drifted while this one
// did: `property_tax_default` went missing from `defaultSharedRow()` here, so a
// portal falling back to the code defaults started the client's estimate at $0
// while staff saw the firm's $1,000 planning figure.
//
// A guard that exists on only one side of a twin is not a guard. This is the
// mirror.

import {
  FALLBACK_FIRM_KEY,
  FIRM_FEE_COLUMNS,
  LETTERHEAD_COLUMNS,
  SHARED_RATE_COLUMNS,
  defaultFirmRow,
  defaultSharedRow,
  mergeConfigRow,
} from "../closingCostSettings";
import { ratesFromConfigRow, DEFAULT_RATES } from "../closingCosts";

test("a merged row carries every key ratesFromConfigRow and the PDF read", () => {
  const merged = mergeConfigRow(null, null, FALLBACK_FIRM_KEY);
  for (const key of [
    ...SHARED_RATE_COLUMNS,
    ...FIRM_FEE_COLUMNS,
    ...LETTERHEAD_COLUMNS,
  ]) {
    expect(merged).toHaveProperty(key);
    expect(merged[key]).toBeDefined();
  }
  expect(merged.firm_key).toBe(FALLBACK_FIRM_KEY);
});

test("defaultSharedRow supplies every column the shared table owns", () => {
  // The specific failure this suite was written for. `closingCostRates.ts`
  // overlays exactly SHARED_RATE_COLUMNS onto the firm row, so a key missing
  // here is a value the portal silently reads as undefined.
  const shared = defaultSharedRow();
  for (const key of SHARED_RATE_COLUMNS) {
    expect(shared).toHaveProperty(key);
    expect(shared[key]).toBeDefined();
  }
});

test("the firm's planning figure for the Statement of Adjustments is $1,000", () => {
  // Mirrors the column default in
  // migrations/2026-08-07-closing-estimate-ltt-override-and-adjustment-default.sql.
  // If the two disagree, an unmigrated environment quotes a different starting
  // figure from a migrated one.
  expect(defaultSharedRow().property_tax_default).toBe(1000);
});

test("merging the code defaults reproduces DEFAULT_RATES exactly", () => {
  const merged = mergeConfigRow(
    defaultFirmRow(FALLBACK_FIRM_KEY),
    defaultSharedRow(),
    FALLBACK_FIRM_KEY,
  );
  expect(ratesFromConfigRow(merged)).toEqual(DEFAULT_RATES);
});
