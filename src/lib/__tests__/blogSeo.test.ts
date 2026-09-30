/**
 * The grounding check on Gemini-drafted search metadata.
 *
 * This is the safety net for the one failure that actually costs something.
 * The meta description and FAQ answers are what Google prints and what an AI
 * Overview quotes, so a figure the article never stated becomes a number this
 * firm published about Ontario real-estate law. A reviewer skimming six boxes
 * for tone will read straight past "1.5%"; the point of this check is that
 * they do not have to catch it.
 *
 * The bias is deliberate: better a warning an admin dismisses than a silent
 * pass on an invented rate.
 */

import { verifyGrounding } from "@/lib/blogSeo";

const base = {
  metaTitle: "",
  metaDescription: "",
  excerpt: "",
  focusKeyword: "",
  tags: [] as string[],
  faq: [] as { question: string; answer: string }[],
};

const ARTICLE =
  "Land transfer tax in Toronto applies on closing. A buyer purchasing at " +
  "$850,000 pays roughly $13,475 provincially, and first-time buyers may " +
  "claim a rebate of up to $4,000. Title insurance is a one-time premium.";

describe("verifyGrounding", () => {
  it("passes copy whose figures all appear in the article", () => {
    expect(
      verifyGrounding(ARTICLE, {
        ...base,
        metaDescription: "First-time buyers can claim up to $4,000 in Ontario.",
      }),
    ).toEqual([]);
  });

  it("matches a figure across thousands separators", () => {
    // "$850,000" in the copy must be satisfied by "850,000" in the source —
    // the model reformats numbers freely and that is not a hallucination.
    expect(
      verifyGrounding(ARTICLE, {
        ...base,
        excerpt: "What a purchase at $850,000 actually costs to close.",
      }),
    ).toEqual([]);
  });

  it("flags a rate the article never states", () => {
    const warnings = verifyGrounding(ARTICLE, {
      ...base,
      metaDescription: "Closing costs run about 1.5% of the purchase price.",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("meta description");
    expect(warnings[0]).toContain("1.5");
  });

  it("flags an invented figure inside an FAQ answer, and says which one", () => {
    const warnings = verifyGrounding(ARTICLE, {
      ...base,
      faq: [
        { question: "Is there a rebate?", answer: "Yes, up to $4,000." },
        { question: "What is the premium?", answer: "Around $2,750 one time." },
      ],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("FAQ answer 2");
    expect(warnings[0]).toContain("2750");
  });

  it("ignores small counts, which are phrasing rather than claims", () => {
    // "3 things" is the model writing a sentence, not asserting a fact. Warning
    // on these would train the reviewer to dismiss the whole list.
    expect(
      verifyGrounding(ARTICLE, {
        ...base,
        metaTitle: "3 things to know about land transfer tax",
      }),
    ).toEqual([]);
  });

  it("reports each invented figure once, however often it is repeated", () => {
    const warnings = verifyGrounding(ARTICLE, {
      ...base,
      metaDescription: "Budget 1.5% — yes, 1.5% — of the price.",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].match(/1\.5/g)).toHaveLength(1);
  });

  it("checks every field, not just the first that fails", () => {
    const warnings = verifyGrounding(ARTICLE, {
      ...base,
      metaTitle: "Save $9,900 on closing",
      metaDescription: "Rebates reach $7,200 in some cases.",
    });
    expect(warnings).toHaveLength(2);
  });
});
