/**
 * The cover a post shows on a card when nobody uploaded one.
 *
 * supabaseAdmin is mocked because blogPosts imports it at module scope for the
 * query helpers; toBlogPost itself is pure and never touches it.
 */
jest.mock("../supabaseAdmin", () => ({ __esModule: true, default: {} }));

import { toBlogPost, type BlogPostRow } from "../blogPosts";

function row(overrides: Partial<BlogPostRow> = {}): BlogPostRow {
  return {
    id: "1",
    created_at: "2026-01-02T12:00:00Z",
    updated_at: "2026-01-02T12:00:00Z",
    slug: "closing-costs",
    status: "published",
    published_at: "2026-01-02T12:00:00Z",
    title: "Closing Costs",
    excerpt: "What you pay on closing.",
    content_html: "<p>Body.</p>",
    content_source: "manual",
    reading_time_min: 4,
    cover_image_url: null,
    cover_image_alt: null,
    author: "iClosed",
    tags: [],
    meta_title: null,
    meta_description: null,
    canonical_url: null,
    og_image_url: null,
    focus_keyword: null,
    faq: [],
    noindex: false,
    ...overrides,
  } as BlogPostRow;
}

describe("toBlogPost cover image", () => {
  test("uses the uploaded cover when there is one", () => {
    const post = toBlogPost(
      row({
        cover_image_url: "https://blob.example/cover.png",
        cover_image_alt: "A house",
        content_html: '<p><img src="https://blob.example/body.png" alt="A deed"></p>',
      }),
    );

    expect(post.image).toBe("https://blob.example/cover.png");
    expect(post.imageAlt).toBe("A house");
    expect(post.imageFromContent).toBe(false);
  });

  test("borrows the first body image when no cover was uploaded", () => {
    const post = toBlogPost(
      row({
        content_html:
          '<p>Intro.</p><img src="https://blob.example/first.png" alt="A deed">' +
          '<img src="https://blob.example/second.png" alt="A key">',
      }),
    );

    expect(post.image).toBe("https://blob.example/first.png");
    expect(post.imageAlt).toBe("A deed");
    expect(post.imageFromContent).toBe(true);
  });

  test("falls back to the title when the borrowed image has no alt text", () => {
    const post = toBlogPost(
      row({ content_html: '<img src="https://blob.example/first.png" alt="">' }),
    );

    expect(post.imageAlt).toBe("Closing Costs");
  });

  test("stays null for a post with no cover and no images at all", () => {
    const post = toBlogPost(row());

    expect(post.image).toBeNull();
    expect(post.imageFromContent).toBe(false);
  });

  // The sanitizer runs before the scan, so anything it strips can never be
  // borrowed — an <img> is only a candidate once it has survived the allowlist.
  test("never borrows an image the sanitizer removed", () => {
    const post = toBlogPost(
      row({ content_html: '<p><img src="javascript:alert(1)" alt="x"></p>' }),
    );

    expect(post.image).toBeNull();
  });
});
