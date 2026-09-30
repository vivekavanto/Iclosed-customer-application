import {
  buildBlogToc,
  stripInlineToc,
  stripInlineSeriesNav,
  stripInlineFaq,
  cleanArticleBody,
} from "../blogToc";
import { sanitizeBlogHtml } from "../sanitizeBlogHtml";

describe("buildBlogToc", () => {
  test("lists h2 and h3 headings and gives each one an id", () => {
    const { html, items } = buildBlogToc(
      "<h2>What Are ChatGPT Ads?</h2><p>Body.</p><h3>Ad Groups</h3>",
    );

    expect(items).toEqual([
      { id: "what-are-chatgpt-ads", text: "What Are ChatGPT Ads?", level: 2 },
      { id: "ad-groups", text: "Ad Groups", level: 3 },
    ]);
    expect(html).toContain('<h2 id="what-are-chatgpt-ads">');
    expect(html).toContain('<h3 id="ad-groups">');
  });

  test("strips markup and entities from the label but leaves the heading alone", () => {
    const { html, items } = buildBlogToc("<h2>Fees &amp; <strong>Costs</strong></h2>");

    expect(items[0]).toEqual({ id: "fees-costs", text: "Fees & Costs", level: 2 });
    expect(html).toBe('<h2 id="fees-costs">Fees &amp; <strong>Costs</strong></h2>');
  });

  test("keeps repeated headings on distinct ids", () => {
    const { items } = buildBlogToc("<h2>Overview</h2><h2>Overview</h2><h2>Overview</h2>");

    expect(items.map((i) => i.id)).toEqual(["overview", "overview-2", "overview-3"]);
  });

  // The page and BlogArticleBody each run it over the same post independently,
  // so the second pass has to produce the links the first one advertised.
  test("is idempotent", () => {
    const once = buildBlogToc("<h2>Closing Costs</h2><h3>Land transfer tax</h3>");
    const twice = buildBlogToc(once.html);

    expect(twice.html).toBe(once.html);
    expect(twice.items).toEqual(once.items);
  });

  test("skips an empty heading but still leaves the body renderable", () => {
    const { html, items } = buildBlogToc("<h2></h2><h2>Real section</h2>");

    expect(items).toEqual([{ id: "real-section", text: "Real section", level: 2 }]);
    expect(html).toContain('<h2 id="section-1"></h2>');
  });

  test("ids stay url-safe for a heading of punctuation and accents", () => {
    const { items } = buildBlogToc("<h2>  Québec: “fees”, 50% — really?  </h2>");

    expect(items[0].id).toMatch(/^[a-z0-9-]+$/);
    expect(items[0].id).toBe("quebec-fees-50-really");
  });

  // The order the real page uses. Ids added before sanitizing would be thrown
  // away by it, which is the whole reason buildBlogToc runs second.
  test("survives the sanitizer when run after it", () => {
    const clean = sanitizeBlogHtml('<h2 id="attacker">Deposits</h2><script>x</script>');
    const { html, items } = buildBlogToc(clean);

    expect(html).toBe('<h2 id="deposits">Deposits</h2>');
    expect(items).toEqual([{ id: "deposits", text: "Deposits", level: 2 }]);
  });
});

describe("stripInlineToc", () => {
  test("removes an author-written contents heading and the list under it", () => {
    const html = stripInlineToc(
      '<p>Intro.</p><h3>On this page</h3><ul><li><a href="#a">A</a></li><li><a href="#b">B</a></li></ul><h2>A</h2><p>Body.</p>',
    );

    expect(html).toBe("<p>Intro.</p><h2>A</h2><p>Body.</p>");
  });

  test("handles a bold paragraph label and an ordered list", () => {
    expect(
      stripInlineToc("<p><strong>Table of contents:</strong></p><ol><li>One</li></ol><h2>One</h2>"),
    ).toBe("<h2>One</h2>");
  });

  test("leaves a label alone when no list follows it", () => {
    const html = "<h3>Contents</h3><p>This article covers three things.</p>";

    expect(stripInlineToc(html)).toBe(html);
  });

  test("leaves an article without a contents block untouched", () => {
    const html = "<h2>Overview</h2><ul><li>A point.</li></ul>";

    expect(stripInlineToc(html)).toBe(html);
  });

  // The label is usually a heading, so it would otherwise become a sidebar
  // entry called "On this page" inside the panel titled "On this page".
  test("keeps the stripped label out of the generated contents", () => {
    const { items } = buildBlogToc(
      stripInlineToc("<h2>On this page</h2><ul><li>x</li></ul><h2>Real Section</h2>"),
    );

    expect(items.map((i) => i.text)).toEqual(["Real Section"]);
  });
});

describe("stripInlineSeriesNav", () => {
  test("removes a hand-written series line from the body", () => {
    const html = stripInlineSeriesNav(
      "<p>Last paragraph.</p><p>Continue the series: « Start of the series | " +
        "Next: What Conditions Should I Put in My Offer? »</p>",
    );

    expect(html).toBe("<p>Last paragraph.</p>");
  });

  test("removes it even when the phrase is wrapped in emphasis", () => {
    expect(
      stripInlineSeriesNav("<p><em>Continue the series:</em> Next: Closing Day</p><h2>X</h2>"),
    ).toBe("<h2>X</h2>");
  });

  test("leaves a sentence that only mentions the series in passing", () => {
    const html = "<p>As we saw earlier in the series, the deposit is held in trust.</p>";

    expect(stripInlineSeriesNav(html)).toBe(html);
  });
});

describe("cleanArticleBody", () => {
  // The page and BlogArticleBody call this, not the individual strippers, so
  // the sidebar is always built from exactly the HTML the body will render.
  test("removes both the inline contents and the series line in one pass", () => {
    const html = cleanArticleBody(
      "<h3>On this page</h3><ul><li>A</li></ul><h2>Real Section</h2><p>Body.</p>" +
        "<p>Continue the series: Next: Closing Day</p>",
    );

    expect(html).toBe("<h2>Real Section</h2><p>Body.</p>");
    expect(buildBlogToc(html).items.map((i) => i.text)).toEqual(["Real Section"]);
  });
});

describe("stripInlineFaq", () => {
  const body =
    "<h2>Should a lawyer review it?</h2><p>Yes.</p>" +
    "<h2>FAQ</h2><p><strong>Is it binding?</strong> Generally, yes.</p>" +
    "<p><strong>Can I back out?</strong> Only if a condition allows it.</p>" +
    "<h2>About the author</h2><p>Kubeskaran.</p>";

  test("removes the heading and everything up to the next heading of the same level", () => {
    expect(stripInlineFaq(body)).toBe(
      "<h2>Should a lawyer review it?</h2><p>Yes.</p><h2>About the author</h2><p>Kubeskaran.</p>",
    );
  });

  test("runs to the end when the FAQ is the last section", () => {
    expect(
      stripInlineFaq("<h2>Terms</h2><p>Body.</p><h2>Frequently asked questions</h2><p>Q.</p>"),
    ).toBe("<h2>Terms</h2><p>Body.</p>");
  });

  // A question styled as a subheading is part of the section, not its end.
  test("keeps deeper headings inside the section", () => {
    expect(
      stripInlineFaq("<h2>FAQ</h2><h3>Is it binding?</h3><p>Yes.</p><h2>Sources</h2>"),
    ).toBe("<h2>Sources</h2>");
  });

  test("leaves a real section whose title merely starts with FAQ", () => {
    const html = "<h2>FAQ for first-time buyers</h2><p>Real prose.</p>";

    expect(stripInlineFaq(html)).toBe(html);
  });

  test("leaves an article with no FAQ section untouched", () => {
    const html = "<h2>Overview</h2><p>Body.</p>";

    expect(stripInlineFaq(html)).toBe(html);
  });
});

describe("cleanArticleBody FAQ handling", () => {
  const body = "<h2>Terms</h2><p>Body.</p><h2>FAQ</h2><p>Q and A.</p>";

  test("drops the body FAQ when the page renders post.faq in its place", () => {
    expect(cleanArticleBody(body, { hasRenderedFaq: true })).toBe(
      "<h2>Terms</h2><p>Body.</p>",
    );
  });

  // Otherwise the body copy is the article's ONLY FAQ; removing it would
  // delete content rather than de-duplicate it.
  test("keeps it for a post whose only FAQ is the one in its body", () => {
    expect(cleanArticleBody(body)).toBe(body);
    expect(cleanArticleBody(body, { hasRenderedFaq: false })).toBe(body);
  });

  test("the stripped FAQ heading does not appear in the sidebar", () => {
    const { items } = buildBlogToc(cleanArticleBody(body, { hasRenderedFaq: true }));

    expect(items.map((i) => i.text)).toEqual(["Terms"]);
  });
});
