// The portal half of the config-snapshot twin.
//
// `src/lib/closingCostConfigSnapshot.ts` is a copy of the admin app's module,
// and both stamp PDFs with `configVersionOf`. If the two implementations drift,
// the same configuration would be labelled two different ways and the stamp
// would stop meaning anything.
//
// The golden value below is the mirror of the one in the admin repo at
// `tests/closingCostConfigSnapshot.test.ts`. Changing it on one side alone is
// what this suite exists to fail on.

import {
  buildConfigSnapshot,
  configFromSnapshot,
  configVersionOf,
} from "../closingCostConfigSnapshot";
import { DEFAULT_RATES } from "../closingCosts";
import { defaultStatementType } from "../closingCostSettings";

const DRAFT = defaultStatementType("draft");

test("configVersionOf: the cross-repo golden stamp", () => {
  const snapshot = buildConfigSnapshot(
    { firm_key: "navawilson", label: "Nava Wilson", firm_name: "ACME" },
    DRAFT,
  );
  expect(configVersionOf(DEFAULT_RATES, snapshot)).toBe("v7.64b1ee0e");
});

test("configFromSnapshot: reads back an admin-written snapshot", () => {
  // Shaped exactly as the admin app writes it into
  // `deal_closing_estimates.config_snapshot`.
  const restored = configFromSnapshot({
    firm: {
      firm_key: "iclosed",
      label: "iClosed",
      firm_name: "ICLOSED",
      brand_color: "#C10007",
    },
    statement_type: {
      type_key: "final",
      title: "STATEMENT OF ACCOUNT — RESIDENTIAL PURCHASE (ONTARIO)",
      show_watermark: false,
    },
  });

  expect(restored).not.toBeNull();
  expect(restored!.config.firm_name).toBe("ICLOSED");
  expect(restored!.statementType.type_key).toBe("final");
  expect(restored!.statementType.show_watermark).toBe(false);
});

test("configFromSnapshot: null on a row written before snapshots existed", () => {
  // The signal for the portal to fall back to the live firm label.
  expect(configFromSnapshot(null)).toBeNull();
  expect(configFromSnapshot({})).toBeNull();
});
