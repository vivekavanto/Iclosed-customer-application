/**
 * The "two co-purchasers" bug: an APS naming two buyers describes the
 * purchaser AND one co-purchaser. Before the self-match the intake had no way
 * to tell which was the client filling the form, so it seeded a card for both.
 */

import {
  checkSelfOnAgreement,
  normalizePartyName,
  splitSelfFromParties,
} from "@/lib/apsPrefill";
import type { ApsExtractionResult } from "@/lib/apsExtraction";

const noValue = { value: null, confidence: "low" as const };

function agreement(over: Partial<ApsExtractionResult> = {}): ApsExtractionResult {
  return {
    is_aps: true,
    purchase_price: noValue,
    deposit: noValue,
    closing_date: noValue,
    property_address: {
      street: null,
      unit: null,
      city: null,
      province: null,
      postal_code: null,
      confidence: "low",
    },
    buyers: [],
    sellers: [],
    agents: [],
    reason: "",
    ...over,
  };
}

const parties = (...names: string[]) => names.map((full_name) => ({ full_name }));

describe("normalizePartyName", () => {
  test("ignores case and collapses whitespace", () => {
    expect(normalizePartyName("  JOHN   Smith ")).toBe("john smith");
  });

  test("keeps a middle name a real difference — matching is exact", () => {
    expect(normalizePartyName("John A Smith")).not.toBe(normalizePartyName("John Smith"));
  });
});

describe("splitSelfFromParties", () => {
  test("consumes exactly one entry, leaving the rest as co-parties", () => {
    const { self, others } = splitSelfFromParties(
      ["John Smith", "Jane Smith"],
      "john smith",
    );
    expect(self).toBe("John Smith");
    expect(others).toEqual(["Jane Smith"]);
  });

  test("a duplicated name still only consumes one", () => {
    const { others } = splitSelfFromParties(
      ["John Smith", "John Smith"],
      "John Smith",
    );
    expect(others).toEqual(["John Smith"]);
  });

  test("no match leaves every name in place", () => {
    const { self, others } = splitSelfFromParties(["Jane Smith"], "John Smith");
    expect(self).toBeNull();
    expect(others).toEqual(["Jane Smith"]);
  });
});

describe("checkSelfOnAgreement", () => {
  test("two buyers become the client plus ONE co-purchaser", () => {
    const result = checkSelfOnAgreement(
      agreement({ buyers: parties("John Smith", "Jane Smith") }),
      "purchase",
      "john smith",
    );
    expect(result).toEqual({
      status: "match",
      role: "purchaser",
      self: "John Smith",
      others: ["Jane Smith"],
    });
  });

  test("matches regardless of casing", () => {
    const result = checkSelfOnAgreement(
      agreement({ buyers: parties("JOHN SMITH") }),
      "purchase",
      "John Smith",
    );
    expect(result.status).toBe("match");
  });

  test("blocks when the client isn't named on the agreement", () => {
    const result = checkSelfOnAgreement(
      agreement({ buyers: parties("Alice Brown", "Bob Brown") }),
      "purchase",
      "John Smith",
    );
    expect(result).toEqual({
      status: "mismatch",
      role: "purchaser",
      names: ["Alice Brown", "Bob Brown"],
      onOppositeSide: false,
    });
  });

  test("flags a client who is on the document, but on the far side of it", () => {
    const result = checkSelfOnAgreement(
      agreement({
        buyers: parties("Alice Brown"),
        sellers: parties("John Smith"),
      }),
      "purchase",
      "John Smith",
    );
    expect(result).toMatchObject({ status: "mismatch", onOppositeSide: true });
  });

  test("a sale-side agreement matches against the sellers", () => {
    const result = checkSelfOnAgreement(
      agreement({
        buyers: parties("Alice Brown"),
        sellers: parties("John Smith", "Jane Smith"),
      }),
      "sale",
      "John Smith",
    );
    expect(result).toEqual({
      status: "match",
      role: "seller",
      self: "John Smith",
      others: ["Jane Smith"],
    });
  });

  test("a middle initial on the agreement does NOT match — exact by decision", () => {
    const result = checkSelfOnAgreement(
      agreement({ buyers: parties("John A. Smith") }),
      "purchase",
      "John Smith",
    );
    expect(result.status).toBe("mismatch");
  });

  // Guards below keep the gate from trapping a client holding a valid file.
  test("a logged-out intake is unverifiable, never a mismatch", () => {
    expect(
      checkSelfOnAgreement(agreement({ buyers: parties("Alice Brown") }), "purchase", ""),
    ).toEqual({ status: "unverifiable" });
  });

  test("a read that found no parties can't be a mismatch", () => {
    expect(
      checkSelfOnAgreement(agreement(), "purchase", "John Smith"),
    ).toEqual({ status: "no-parties", role: "purchaser" });
  });

  test("a non-APS upload doesn't reach the party gate", () => {
    expect(
      checkSelfOnAgreement(
        agreement({ is_aps: false, buyers: parties("Alice Brown") }),
        "purchase",
        "John Smith",
      ),
    ).toEqual({ status: "unverifiable" });
  });
});
