import { verifyWordsPreserved } from "../blogFormat";
import { slugify } from "../blogSlug";

/**
 * verifyWordsPreserved is the check that makes "structure only" enforceable
 * rather than merely requested. A prompt asks the model not to rewrite the
 * author; this is what notices when it did anyway.
 */
describe("verifyWordsPreserved", () => {
  const source =
    "Title insurance protects Ontario homebuyers against title fraud and survey problems.";

  test("pure markup scores a perfect 1", () => {
    const html = `<p>${source}</p>`;
    expect(verifyWordsPreserved(source, html).ratio).toBe(1);
  });

  test("splitting into headings and lists still scores 1 — structure is free", () => {
    const html = `
      <h2>Title insurance</h2>
      <p>protects Ontario homebuyers</p>
      <ul><li>against title fraud</li><li>and survey problems.</li></ul>
    `;
    expect(verifyWordsPreserved(source, html).ratio).toBe(1);
  });

  test("a rewritten sentence scores below 1 and names what went missing", () => {
    const html = "<p>Title insurance is a great product for buyers.</p>";
    const { ratio, missing } = verifyWordsPreserved(source, html);

    expect(ratio).toBeLessThan(0.97);
    expect(missing).toContain("fraud");
    expect(missing).toContain("survey");
  });

  test("dropping a whole clause is caught", () => {
    const html = "<p>Title insurance protects Ontario homebuyers.</p>";
    expect(verifyWordsPreserved(source, html).ratio).toBeLessThan(1);
  });

  test("punctuation and casing changes alone do not count as loss", () => {
    const html = "<p>TITLE INSURANCE protects Ontario homebuyers — against title fraud, and survey problems!</p>";
    expect(verifyWordsPreserved(source, html).ratio).toBe(1);
  });

  test("empty source is 1, not a divide-by-zero", () => {
    expect(verifyWordsPreserved("", "<p>anything</p>").ratio).toBe(1);
  });

  test("the missing list stays short enough to read", () => {
    const long = Array(200).fill("disbursement").join(" ");
    const { missing } = verifyWordsPreserved(long, "<p></p>");
    expect(missing.length).toBeLessThanOrEqual(12);
  });

  test("repeated words are counted, not just matched once", () => {
    // "fee" three times in, once out: two are genuinely gone.
    const { ratio } = verifyWordsPreserved("fee fee fee", "<p>fee</p>");
    expect(ratio).toBeCloseTo(1 / 3, 5);
  });
});

describe("slugify", () => {
  test("lowercases and hyphenates", () => {
    expect(slugify("Why Title Insurance Is Essential")).toBe(
      "why-title-insurance-is-essential",
    );
  });

  test("folds accents rather than dropping the letter", () => {
    expect(slugify("Ontario Café Closing")).toBe("ontario-cafe-closing");
  });

  test("strips punctuation and emoji", () => {
    expect(slugify("Disbursements — what are they? 📄")).toBe(
      "disbursements-what-are-they",
    );
  });

  test("collapses runs of separators and trims the ends", () => {
    expect(slugify("  ---Hello???World---  ")).toBe("hello-world");
  });

  test("caps length and never ends on a hyphen", () => {
    const out = slugify(Array(40).fill("word").join(" "));
    expect(out.length).toBeLessThanOrEqual(70);
    expect(out.endsWith("-")).toBe(false);
  });

  test("an unusable title yields an empty string for the caller to default", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("")).toBe("");
  });
});
