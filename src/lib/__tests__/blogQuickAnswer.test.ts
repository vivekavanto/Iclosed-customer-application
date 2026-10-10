import { parseQuickAnswer, stripQuickAnswer } from "../blogQuickAnswer";
import { cleanArticleBody } from "../blogToc";

/** The two shapes the published posts actually use. */
const BARE =
  "<p>Quick answer: Home policies commonly cover the dwelling, belongings and " +
  "personal liability.</p><p>Standard policies vary by insurer.</p>";

const STRONG =
  "<p><strong>Quick answer:</strong> A title search is your lawyer’s review of " +
  "Ontario’s electronic land registry.</p><p>It happens before closing.</p>";

describe("parseQuickAnswer", () => {
  test("reads a bare 'Quick answer:' paragraph without its label", () => {
    expect(parseQuickAnswer(BARE)).toBe(
      "Home policies commonly cover the dwelling, belongings and personal liability.",
    );
  });

  // The label is removed as markup before the tags come off; doing it the other
  // way round would leave "Quick answer:" sitting at the front of the text.
  test("reads a <strong>-wrapped label without leaving it behind", () => {
    const text = parseQuickAnswer(STRONG);

    expect(text).not.toMatch(/quick answer/i);
    expect(text).toBe(
      "A title search is your lawyer’s review of Ontario’s electronic land registry.",
    );
  });

  // In storage the byline sits above it, so it is the SECOND paragraph until
  // cleanArticleBody removes that line — toBlogPost parses the raw body.
  test("finds it under the byline the article opens with", () => {
    const html =
      "<p>By Anita Rao, Lawyer · Reading time: 3 min</p>" +
      "<p>Quick answer: You need a void cheque.</p>";

    expect(parseQuickAnswer(html)).toBe("You need a void cheque.");
  });

  test("returns null for an article with no quick answer", () => {
    expect(parseQuickAnswer("<h2>Costs</h2><p>Some prose.</p>")).toBeNull();
  });

  test("ignores a label with nothing after it", () => {
    expect(parseQuickAnswer("<p><strong>Quick answer:</strong></p>")).toBeNull();
  });

  test("ignores the phrase appearing further down the article", () => {
    const html =
      "<p>One.</p><p>Two.</p><p>Three.</p><p>Quick answer: too late to count.</p>";

    expect(parseQuickAnswer(html)).toBeNull();
  });
});

describe("stripQuickAnswer", () => {
  test("removes the paragraph and leaves the rest of the article", () => {
    expect(stripQuickAnswer(BARE)).toBe("<p>Standard policies vary by insurer.</p>");
  });

  test("leaves an article with no quick answer untouched", () => {
    const html = "<h2>Costs</h2><p>Some prose.</p>";
    expect(stripQuickAnswer(html)).toBe(html);
  });

  // The page prints it under the title now, so the body must not — and the
  // sidebar and BlogArticleBody both go through cleanArticleBody to agree.
  test("is applied by cleanArticleBody, after the byline is removed", () => {
    const html =
      "<p>By Anita Rao, Lawyer · Reading time: 3 min</p>" +
      "<p>Quick answer: You need a void cheque.</p>" +
      "<h2>Why</h2><p>Because the lender asks.</p>";

    expect(cleanArticleBody(html)).toBe("<h2>Why</h2><p>Because the lender asks.</p>");
  });
});
