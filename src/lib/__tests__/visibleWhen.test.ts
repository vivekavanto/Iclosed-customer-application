import { getVisibleWhen, isVisibleByRules } from "@/lib/visibleWhen";

// The exact rule sql/add_separation_agreement_upload.sql writes onto the
// "Separation agreement or divorce certificate" upload. Both templates get the
// same marital value list (it covers every Separated value either side offers);
// only the residence question's label differs.
function separationUploadOptions(residenceLabel: string) {
  return {
    accept: ".pdf,.jpg,.jpeg,.png",
    max_mb: 10,
    doc_type: "separation_agreement",
    description: "We review this to confirm how title and any interest in the property is to be held, and whether spousal consent is required.",
    visible_when: {
      all: [
        {
          field_label: "Marital Status",
          equals_any: ["divorced", "separated", "separated_formal", "separated_no_formal"],
        },
        { field_label: residenceLabel, equals: "primary" },
      ],
    },
  };
}

const PURCHASE_RESIDENCE =
  "Is this purchase property your primary residence or an investment property?";
const SALE_RESIDENCE =
  "Is the property being sold your primary residence or an investment property?";

// Marital Status options as each template actually offers them. Purchase
// collapsed formal/no-formal into one "Separated"; Sale kept both.
const PURCHASE_MARITAL = ["single", "married", "common_law", "divorced", "separated"];
const SALE_MARITAL = [
  "single", "married", "common_law", "divorced", "separated_formal", "separated_no_formal",
];

const TRIGGERING = ["divorced", "separated", "separated_formal", "separated_no_formal"];

/** Runs the upload's rule against one pair of answers. */
function uploadShows(residenceLabel: string, marital: string, residence: string) {
  const fields = [
    { id: "m", label: "Marital Status" },
    { id: "r", label: residenceLabel },
  ];
  return isVisibleByRules(
    separationUploadOptions(residenceLabel),
    fields,
    { m: marital, r: residence },
  );
}

describe.each([
  ["Purchase", PURCHASE_RESIDENCE, PURCHASE_MARITAL],
  ["Sale", SALE_RESIDENCE, SALE_MARITAL],
])("separation agreement upload — %s", (_side, residenceLabel, maritalOptions) => {
  const triggering = maritalOptions.filter((m) => TRIGGERING.includes(m));
  const nonTriggering = maritalOptions.filter((m) => !TRIGGERING.includes(m));

  test("hidden when marital status is neither divorced nor separated, whatever the property type", () => {
    for (const marital of nonTriggering) {
      expect(uploadShows(residenceLabel, marital, "primary")).toBe(false);
      expect(uploadShows(residenceLabel, marital, "investment")).toBe(false);
    }
  });

  test("hidden when marital status qualifies but the property is not a primary residence", () => {
    for (const marital of triggering) {
      expect(uploadShows(residenceLabel, marital, "investment")).toBe(false);
    }
  });

  test("shown only when BOTH conditions hold", () => {
    for (const marital of triggering) {
      expect(uploadShows(residenceLabel, marital, "primary")).toBe(true);
    }
  });

  test("hidden while either question is still unanswered", () => {
    expect(uploadShows(residenceLabel, "", "")).toBe(false);
    expect(uploadShows(residenceLabel, "divorced", "")).toBe(false);
    expect(uploadShows(residenceLabel, "", "primary")).toBe(false);
  });
});

// Purchase merged the two Separated options into one; Sale did not. Per the
// agreed rule, every Separated variant triggers the upload.
test("both Sale separated variants trigger the upload", () => {
  expect(uploadShows(SALE_RESIDENCE, "separated_formal", "primary")).toBe(true);
  expect(uploadShows(SALE_RESIDENCE, "separated_no_formal", "primary")).toBe(true);
});

describe("getVisibleWhen", () => {
  test("reads the single-clause shape existing fields use", () => {
    expect(
      getVisibleWhen({
        visible_when: { field_label: "Marital Status", equals: "divorced" },
      }),
    ).toEqual([{ field_label: "Marital Status", values: ["divorced"] }]);
  });

  test("reads every clause of an `all` rule", () => {
    expect(getVisibleWhen(separationUploadOptions(SALE_RESIDENCE))).toHaveLength(2);
  });

  test("returns null for a field with no usable rule", () => {
    expect(getVisibleWhen({ doc_type: "aps" })).toBeNull();
    expect(getVisibleWhen({ visible_when: { field_label: "X" } })).toBeNull();
    expect(getVisibleWhen(null)).toBeNull();
  });
});

describe("isVisibleByRules", () => {
  test("a field with no rule always shows", () => {
    expect(isVisibleByRules({ doc_type: "aps" }, [], {})).toBe(true);
  });

  test("matching is case-insensitive on both label and value", () => {
    const fields = [{ id: "m", label: "  marital status  " }];
    expect(
      isVisibleByRules(
        { visible_when: { field_label: "Marital Status", equals: "divorced" } },
        fields,
        { m: "Divorced" },
      ),
    ).toBe(true);
  });

  test("fails open when a parent question is not on the form", () => {
    expect(
      isVisibleByRules(
        { visible_when: { field_label: "Missing question", equals: "x" } },
        [{ id: "m", label: "Marital Status" }],
        { m: "divorced" },
      ),
    ).toBe(true);
  });
});
