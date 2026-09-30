import { parseBlogByline, stripInlineByline } from "../blogByline";
import { cleanArticleBody } from "../blogToc";

/** The shape these articles actually open with. */
const REAL =
  "<p>By Gathyayini Manoharan, Real Estate Lawyer and Practice Lead, iClosed " +
  "· Licensed by the Law Society of Ontario, LSO #75591T · Last reviewed: " +
  "September 2026 · Reading time: ~6 min</p>" +
  "<p><strong>Quick answer:</strong> Your signing appointment is a meeting.</p>";

describe("parseBlogByline", () => {
  test("reads the author, role, credentials, review date and reading time", () => {
    expect(parseBlogByline(REAL)).toEqual({
      author: "Gathyayini Manoharan",
      role: "Real Estate Lawyer and Practice Lead, iClosed",
      credentials: "Licensed by the Law Society of Ontario, LSO #75591T",
      reviewed: "September 2026",
      readTime: "~6 min read",
    });
  });

  // The page prints readTime as-is next to a clock, so a bare "~6 min" has to
  // come back reading like the "9 min read" it replaces.
  test("leaves a reading time that already says 'read' alone", () => {
    const html = "<p>By Anita Rao, Lawyer · Reading time: 8 min read</p>";
    expect(parseBlogByline(html)?.readTime).toBe("8 min read");
  });

  test("accepts the other separators and labels editors type", () => {
    const html =
      "<p>By Anita Rao, Associate | Last updated: March 2026 | Read time: 4 min</p>";

    expect(parseBlogByline(html)).toMatchObject({
      author: "Anita Rao",
      role: "Associate",
      reviewed: "March 2026",
      readTime: "4 min read",
    });
  });

  test("survives inline markup and entities in the byline", () => {
    const html =
      "<p><em>By Anita Rao, Lawyer &amp; Notary</em> &middot; Reading time: 3 min</p>";

    expect(parseBlogByline(html)).toMatchObject({
      author: "Anita Rao",
      role: "Lawyer & Notary",
      readTime: "3 min read",
    });
  });

  test("returns null for an article with no byline", () => {
    expect(parseBlogByline("<h2>Closing costs</h2><p>Some prose.</p>")).toBeNull();
  });

  // The guards that stop ordinary prose being read as attribution — and, worse,
  // deleted from the article by the stripper.
  test("ignores prose that merely opens with 'By'", () => {
    const html =
      "<p>By the time your lender releases the funds, your lawyer will have " +
      "registered the transfer · which is the step most buyers ask about.</p>";

    expect(parseBlogByline(html)).toBeNull();
  });

  test("ignores a byline that appears further down the article", () => {
    const body = "<p>One.</p><p>Two.</p><p>Three.</p><p>Four.</p>";
    const late = `${body}<p>By Anita Rao, Lawyer · Reading time: 3 min</p>`;

    expect(parseBlogByline(late)).toBeNull();
  });

  test("ignores a bare 'By Someone' with nothing else on the line", () => {
    expect(parseBlogByline("<p>By Anita Rao</p>")).toBeNull();
  });
});

describe("stripInlineByline", () => {
  test("removes the byline paragraph and leaves the article intact", () => {
    const stripped = stripInlineByline(REAL);

    expect(stripped).not.toContain("Gathyayini Manoharan");
    expect(stripped).toBe(
      "<p><strong>Quick answer:</strong> Your signing appointment is a meeting.</p>",
    );
  });

  test("leaves an article with no byline untouched", () => {
    const html = "<h2>Closing costs</h2><p>Some prose.</p>";
    expect(stripInlineByline(html)).toBe(html);
  });

  // The page header prints the byline now, so the body must not — and both the
  // sidebar and BlogArticleBody go through cleanArticleBody to agree on that.
  test("is applied by cleanArticleBody", () => {
    expect(cleanArticleBody(REAL)).not.toContain("Gathyayini Manoharan");
  });
});
