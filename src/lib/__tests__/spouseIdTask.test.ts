jest.mock("@/lib/supabaseAdmin", () => ({ __esModule: true, default: {} }));

import {
  isSamePersonName,
  normalizePersonName,
  spouseNameFromResponses,
} from "@/lib/spouseIdTask";

describe("normalizePersonName", () => {
  test("lowercases, drops punctuation and collapses spaces", () => {
    expect(normalizePersonName("  Alice  M. KATE ")).toBe("alice m kate");
  });
});

describe("isSamePersonName", () => {
  test("matches the same name regardless of case and spacing", () => {
    expect(isSamePersonName("Alice Kate", "alice  kate")).toBe(true);
  });

  test("matches when only a middle name differs", () => {
    expect(isSamePersonName("Alice Marie Kate", "Alice Kate")).toBe(true);
  });

  test("does not match different people", () => {
    expect(isSamePersonName("Alice Kate", "Ben Alan")).toBe(false);
    expect(isSamePersonName("Alice Kate", "Alice Alan")).toBe(false);
  });

  test("never matches a blank or single-word name loosely", () => {
    expect(isSamePersonName("", "")).toBe(false);
    expect(isSamePersonName("Alice", "Alice Kate")).toBe(false);
  });
});

describe("spouseNameFromResponses", () => {
  test("reads the spouse field, trimmed", () => {
    expect(
      spouseNameFromResponses([
        { field_type: "select", value: "married" },
        { field_type: "spouse", value: "  Alice   Kate " },
      ]),
    ).toBe("Alice Kate");
  });

  test("is blank when the field was hidden or absent", () => {
    expect(spouseNameFromResponses([{ field_type: "spouse", value: "" }])).toBe("");
    expect(spouseNameFromResponses([{ field_type: "text", value: "x" }])).toBe("");
  });
});
