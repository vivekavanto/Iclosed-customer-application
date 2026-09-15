/**
 * A model answer is not always the shape we asked for.
 *
 * The prompt asked for one JSON object and the strong tiers gave one. The
 * flash-lite rung the ladder falls back to did not: given a real agreement
 * uploaded as ONE PDF with five OREA forms stapled into it, it answered with an
 * ARRAY of per-form objects on roughly half of its runs.
 *
 * `(raw ?? {}).is_aps` on an array is `undefined`, so a correctly-read
 * agreement came back `is_aps: false` with every field null. The client was
 * told "that doesn't look like an Agreement of Purchase and Sale" and asked to
 * type in a price, deposit and closing date the model had in fact read
 * perfectly — and nothing logged an error, because every layer believed the
 * read had succeeded.
 *
 * These cover the two things that fixes: an answer is found whatever wrapper
 * it arrives in, and an answer with no extraction in it at all is reported as
 * unreadable (null — the route tries the next model) rather than as a verdict
 * on the client's document.
 */

import {
  mergeApsExtractions,
  parseApsPayload,
  unwrapApsPayloads,
  type ApsExtractionResult,
} from "@/lib/apsExtraction";

/** The fields the flash-lite rung actually returned for 88 Frey Crescent. */
const FREY = {
  is_aps: true,
  document_type: "aps",
  purchase_price: { value: "870000", confidence: "high" },
  deposit: { value: "43500", confidence: "high" },
  closing_date: { value: "2026-09-16", confidence: "high" },
  property_address: {
    street: "88 Frey Crescent",
    unit: null,
    city: "Toronto",
    province: "ON",
    postal_code: "M1R 2C8",
    confidence: "high",
  },
  buyers: [{ full_name: "Kejda Trungu" }],
  sellers: [
    { full_name: "DEBBIE CHIANG" },
    { full_name: "CHUNG PAUL LEUNG" },
    { full_name: "DIANE LEUNG" },
  ],
  agents: [
    {
      full_name: "BEN CHEN",
      brokerage: "BAY STREET GROUP INC.",
      role: "listing",
      email: "ben.chen.realestate@gmail.com",
      phone: "905-909-0101",
    },
  ],
  reason: null,
};

function expectFrey(result: ApsExtractionResult | null) {
  expect(result).not.toBeNull();
  expect(result!.is_aps).toBe(true);
  expect(result!.document_type).toBe("aps");
  expect(result!.purchase_price.value).toBe("870000");
  expect(result!.deposit.value).toBe("43500");
  expect(result!.closing_date.value).toBe("2026-09-16");
  expect(result!.property_address.street).toBe("88 Frey Crescent");
  expect(result!.buyers).toHaveLength(1);
  expect(result!.sellers).toHaveLength(3);
}

describe("parseApsPayload — the shape the model actually sent", () => {
  it("reads a plain object, as the strong tiers send it", () => {
    expectFrey(parseApsPayload(FREY));
  });

  // The regression itself. Before the fix this returned is_aps:false with every
  // value null, and the client was told their agreement was the wrong document.
  it("reads an agreement the model wrapped in an array", () => {
    expectFrey(parseApsPayload([FREY]));
  });

  it("reads an agreement wrapped in a single-key object", () => {
    expectFrey(parseApsPayload({ result: FREY }));
    expectFrey(parseApsPayload({ documents: [FREY] }));
  });

  it("merges an array the model split form-by-form, amendments last", () => {
    const amendment = {
      is_aps: true,
      document_type: "amendment",
      purchase_price: { value: "880000", confidence: "high" },
      closing_date: { value: "2026-10-01", confidence: "high" },
    };

    const result = parseApsPayload([FREY, amendment]);

    expect(result).not.toBeNull();
    // The amendment's terms win where it speaks...
    expect(result!.purchase_price.value).toBe("880000");
    expect(result!.closing_date.value).toBe("2026-10-01");
    // ...and the agreement's stand where it is silent.
    expect(result!.deposit.value).toBe("43500");
    expect(result!.property_address.street).toBe("88 Frey Crescent");
    expect(result!.sellers).toHaveLength(3);
  });

  it("orders an out-of-order array by document type, not by position", () => {
    const amendment = {
      is_aps: true,
      document_type: "amendment",
      deposit: { value: "60000", confidence: "high" },
    };

    // The amendment listed FIRST must still override the agreement after it.
    const result = parseApsPayload([amendment, FREY]);
    expect(result!.deposit.value).toBe("60000");
    expect(result!.purchase_price.value).toBe("870000");
  });
});

describe("parseApsPayload — answers with no extraction in them", () => {
  // null means "this model's answer was unreadable, try the next one". It must
  // never be confused with is_aps:false, which means "we read this file and it
  // is not an agreement" — the difference is what the client gets told.
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a bare string", "sorry, I could not read that"],
    ["a number", 42],
    ["an empty object", {}],
    ["an empty array", []],
    ["an array of nothing useful", [null, "x", 3]],
    ["an unrelated object", { foo: "bar", nested: { baz: 1 } }],
  ])("reports %s as unreadable, not as a rejected document", (_label, raw) => {
    expect(parseApsPayload(raw)).toBeNull();
  });

  it("keeps a genuine rejection a rejection", () => {
    const notAnAgreement = {
      is_aps: false,
      document_type: "other",
      reason: "A driver's licence",
    };

    const result = parseApsPayload(notAnAgreement);
    expect(result).not.toBeNull();
    expect(result!.is_aps).toBe(false);
    expect(result!.reason).toBe("A driver's licence");
  });

  it("recognizes an extraction by any of its fields, even a partial one", () => {
    const partial = { buyers: [{ full_name: "Kejda Trungu" }] };
    const result = parseApsPayload(partial);
    expect(result).not.toBeNull();
    expect(result!.buyers).toHaveLength(1);
  });
});

describe("unwrapApsPayloads", () => {
  it("stays bounded on a deeply nested answer", () => {
    // Guards the search itself: a pathological answer must not walk forever.
    let nested: unknown = FREY;
    for (let i = 0; i < 12; i++) nested = { wrapper: nested };
    expect(unwrapApsPayloads(nested)).toHaveLength(0);
  });

  it("caps how many documents one answer can contribute", () => {
    const many = Array.from({ length: 50 }, () => FREY);
    expect(unwrapApsPayloads(many).length).toBeLessThanOrEqual(12);
  });

  it("preserves the order the model gave", () => {
    const first = { ...FREY, buyers: [{ full_name: "First Buyer" }] };
    const second = { ...FREY, buyers: [{ full_name: "Second Buyer" }] };
    const merged = mergeApsExtractions(
      unwrapApsPayloads([first, second]).map(
        (p) => parseApsPayload(p) as ApsExtractionResult,
      ),
    );
    expect(merged.buyers.map((b) => b.full_name)).toEqual([
      "First Buyer",
      "Second Buyer",
    ]);
  });
});
