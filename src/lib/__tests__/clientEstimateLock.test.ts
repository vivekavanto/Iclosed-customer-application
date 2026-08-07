// The client calculator is a LOCKED surface: the buyer supplies their mortgage
// amount and whether they are a first-time buyer, and nothing else.
//
// These tests exist because that rule used to live only in the markup. Every
// key asserted below was, at one point, read straight from the request body —
// which meant a client could POST any price, any purchaser name, any firm and
// any fee and get it back on the firm's letterhead. If a future change makes
// one of them settable again, this suite is what says so.

import {
  CLIENT_EDITABLE_KEYS,
  CLIENT_SELECTOR_KEYS,
  LOCKED_INPUT_KEYS,
  MAX_AMOUNT,
  parseClientMortgage,
  parseFileId,
  rejectLockedInputs,
} from "../clientEstimateLock";

describe("rejectLockedInputs", () => {
  test("the two client answers pass", () => {
    expect(
      rejectLockedInputs({ mortgage_amount: 450000, is_first_time_buyer: true }),
    ).toBeNull();
  });

  test("an empty body passes", () => {
    expect(rejectLockedInputs({})).toBeNull();
  });

  test("every locked key is refused on its own", () => {
    for (const key of LOCKED_INPUT_KEYS) {
      const error = rejectLockedInputs({ [key]: "anything" });
      expect(error).toContain(key);
    }
  });

  test("presence is refused, not just a truthy value", () => {
    // A null price is still the caller claiming control of the price.
    expect(rejectLockedInputs({ purchase_price: null })).not.toBeNull();
    expect(rejectLockedInputs({ purchase_price: 0 })).not.toBeNull();
    expect(rejectLockedInputs({ adjustments: {} })).not.toBeNull();
  });

  test("the specific tampering the lock was written for", () => {
    // Zero the legal fee, rename the purchaser, invent a price, pick a firm.
    expect(
      rejectLockedInputs({
        mortgage_amount: 0,
        adjustments: { legal_fees: 0, admin_fee: 0 },
      }),
    ).not.toBeNull();
    expect(rejectLockedInputs({ purchasers: "Someone Else" })).not.toBeNull();
    expect(rejectLockedInputs({ purchase_price: 1 })).not.toBeNull();
    expect(rejectLockedInputs({ firm_key: "nava_wilson" })).not.toBeNull();
    // "Final account" is an admin-only document; a client cannot ask for one.
    expect(rejectLockedInputs({ statement_type: "final" })).not.toBeNull();
    // Nor may they choose who the firm emails.
    expect(rejectLockedInputs({ to: "someone@example.com" })).not.toBeNull();
  });

  test("a prototype-chain key is not mistaken for a supplied one", () => {
    expect(rejectLockedInputs({ mortgage_amount: 1 })).toBeNull();
  });

  test("editable and locked sets do not overlap", () => {
    for (const key of CLIENT_EDITABLE_KEYS) {
      expect(LOCKED_INPUT_KEYS).not.toContain(key);
    }
  });

  test("the file selector is allowed through, not locked out", () => {
    // `file_id` chooses WHICH of the client's own files to read; it is not a
    // figure. Locking it would leave a client with two files unable to say
    // which one they meant.
    for (const key of CLIENT_SELECTOR_KEYS) {
      expect(LOCKED_INPUT_KEYS).not.toContain(key);
    }
    expect(
      rejectLockedInputs({
        file_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
        mortgage_amount: 450000,
      }),
    ).toBeNull();
  });
});

describe("parseFileId", () => {
  test("absent means 'my default file'", () => {
    expect(parseFileId(null)).toBeNull();
    expect(parseFileId(undefined)).toBeNull();
    expect(parseFileId("")).toBeNull();
  });

  test("a uuid passes through", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(parseFileId(id)).toBe(id);
    expect(parseFileId(id.toUpperCase())).toBe(id.toUpperCase());
  });

  test("anything else is refused, not ignored", () => {
    // Silently falling back to the default file would hand a caller who asked
    // for one file another file's figures, with no way to tell.
    for (const bad of ["not-a-uuid", "1; DROP TABLE deals", 42, {}, []]) {
      expect(parseFileId(bad)).toHaveProperty("error");
    }
  });
});

describe("parseClientMortgage", () => {
  test("a plain amount", () => {
    expect(parseClientMortgage(450000)).toBe(450000);
    expect(parseClientMortgage("450000")).toBe(450000);
  });

  test("blank and absent are a cash deal, not an error", () => {
    expect(parseClientMortgage("")).toBe(0);
    expect(parseClientMortgage(null)).toBe(0);
    expect(parseClientMortgage(undefined)).toBe(0);
  });

  test("negative, non-numeric and absurd amounts are refused", () => {
    expect(parseClientMortgage(-1)).toHaveProperty("error");
    expect(parseClientMortgage("abc")).toHaveProperty("error");
    expect(parseClientMortgage(Infinity)).toHaveProperty("error");
    expect(parseClientMortgage(MAX_AMOUNT + 1)).toHaveProperty("error");
  });

  test("the ceiling itself is allowed", () => {
    expect(parseClientMortgage(MAX_AMOUNT)).toBe(MAX_AMOUNT);
  });
});
