import {
  sanitizeBlogHtml,
  blogHtmlToText,
  readingTimeFromHtml,
} from "../sanitizeBlogHtml";

/**
 * These cover the last thing standing between stored HTML and
 * dangerouslySetInnerHTML on a public page.
 */
describe("sanitizeBlogHtml — stripping hostile markup", () => {
  test("removes script tags and their contents", () => {
    const out = sanitizeBlogHtml('<p>Safe</p><script>alert("xss")</script>');
    expect(out).toContain("<p>Safe</p>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert");
  });

  test("strips inline event handlers", () => {
    const out = sanitizeBlogHtml('<p onclick="steal()">Text</p>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("Text");
  });

  test("drops javascript: hrefs but keeps the link text", () => {
    const out = sanitizeBlogHtml('<a href="javascript:alert(1)">Click</a>');
    expect(out).not.toContain("javascript:");
    expect(out).toContain("Click");
  });

  test("drops data: URIs, which are how an SVG payload gets smuggled in", () => {
    const out = sanitizeBlogHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="x">');
    expect(out).not.toContain("data:");
  });

  test("removes style, class and id attributes", () => {
    const out = sanitizeBlogHtml(
      '<p class="bg-black" id="x" style="display:none">Hidden?</p>',
    );
    expect(out).not.toContain("class");
    expect(out).not.toContain("style");
    expect(out).not.toContain("id=");
    expect(out).toContain("Hidden?");
  });

  test("unwraps divs and spans rather than keeping page-level layout tags", () => {
    const out = sanitizeBlogHtml("<div><p>Body</p></div>");
    expect(out).not.toContain("<div");
    expect(out).toContain("<p>Body</p>");
  });

  test("drops h1 — the page renders the title as the only h1", () => {
    const out = sanitizeBlogHtml("<h1>Second title</h1><h2>Real heading</h2>");
    expect(out).not.toContain("<h1");
    expect(out).toContain("<h2>Real heading</h2>");
  });

  test("empty, null and undefined are all the empty string, never a throw", () => {
    expect(sanitizeBlogHtml("")).toBe("");
    expect(sanitizeBlogHtml(null)).toBe("");
    expect(sanitizeBlogHtml(undefined)).toBe("");
  });
});

describe("sanitizeBlogHtml — link handling", () => {
  test("external links get nofollow and open in a new tab", () => {
    const out = sanitizeBlogHtml('<a href="https://example.com">Out</a>');
    expect(out).toContain('rel="nofollow noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  test("internal links are left alone, so crawlers follow them", () => {
    const out = sanitizeBlogHtml('<a href="/closing-cost-calculator">Calculator</a>');
    expect(out).not.toContain("nofollow");
    expect(out).not.toContain("_blank");
  });

  test("mailto and tel count as internal", () => {
    expect(sanitizeBlogHtml('<a href="mailto:a@b.ca">Mail</a>')).not.toContain("nofollow");
    expect(sanitizeBlogHtml('<a href="tel:4163211100">Call</a>')).not.toContain("nofollow");
  });
});

describe("sanitizeBlogHtml — preserving real article markup", () => {
  // A regression guard on the migration. The three seeded posts are live
  // content; a sanitizer that quietly eats their structure would be noticed
  // only by a reader.
  const realArticle = `
    <p>Title insurance protects your ownership.</p>
    <h2>📄 What it covers</h2>
    <ul><li>Survey issues</li><li>Title fraud</li></ul>
    <p>It doesn&rsquo;t cover everything &mdash; ask your lawyer.</p>
    <blockquote>Always read the policy.</blockquote>
  `;

  test("keeps every tag the articles actually use", () => {
    const out = sanitizeBlogHtml(realArticle);
    for (const tag of ["<p>", "<h2>", "<ul>", "<li>", "<blockquote>"]) {
      expect(out).toContain(tag);
    }
  });

  test("keeps emoji in headings and typographic punctuation", () => {
    const out = sanitizeBlogHtml(realArticle);
    expect(out).toContain("📄");
    expect(out).toContain("What it covers");
    expect(out).toMatch(/doesn.{0,8}t cover everything/);
  });

  test("keeps tables and ordered lists, which AI formatting can now produce", () => {
    const out = sanitizeBlogHtml(
      "<ol><li>First</li></ol><table><tbody><tr><td>Fee</td></tr></tbody></table>",
    );
    expect(out).toContain("<ol>");
    expect(out).toContain("<table>");
    expect(out).toContain("<td>Fee</td>");
  });
});

describe("blogHtmlToText / readingTimeFromHtml", () => {
  test("strips tags and collapses whitespace", () => {
    expect(blogHtmlToText("<p>Hello</p>\n<p>  world  </p>")).toBe("Hello world");
  });

  test("never returns a reading time below one minute", () => {
    expect(readingTimeFromHtml("<p>Short.</p>")).toBe(1);
    expect(readingTimeFromHtml("")).toBe(1);
  });

  test("scales with length at roughly 200 words a minute", () => {
    const words = Array(600).fill("word").join(" ");
    expect(readingTimeFromHtml(`<p>${words}</p>`)).toBe(3);
  });
});
