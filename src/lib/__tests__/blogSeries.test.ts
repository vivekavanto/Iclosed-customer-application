import { adjacentInSeries } from "../blogSeries";
import type { BlogPost } from "../blogPosts";

// Only the three fields the ordering looks at matter here.
function post(slug: string, publishedAt: string | null): BlogPost {
  return { slug, publishedAt, title: slug } as BlogPost;
}

// Deliberately NOT in reading order: this is the newest-first order
// listPublishedPosts() hands the page, and the point of the helper is that it
// does not depend on how the caller sorted.
const posts = [
  post("third", "2026-03-01T12:00:00Z"),
  post("second", "2026-02-01T12:00:00Z"),
  post("first", "2026-01-01T12:00:00Z"),
];

describe("adjacentInSeries", () => {
  test("next is the article published after this one", () => {
    const at = adjacentInSeries(posts, "second");

    expect(at.previous?.slug).toBe("first");
    expect(at.next?.slug).toBe("third");
    expect(at.index).toBe(2);
    expect(at.total).toBe(3);
  });

  test("the first article has no previous", () => {
    const at = adjacentInSeries(posts, "first");

    expect(at.previous).toBeNull();
    expect(at.next?.slug).toBe("second");
    expect(at.index).toBe(1);
  });

  test("the last article has no next", () => {
    const at = adjacentInSeries(posts, "third");

    expect(at.previous?.slug).toBe("second");
    expect(at.next).toBeNull();
    expect(at.index).toBe(3);
  });

  test("a single post is not a series", () => {
    const at = adjacentInSeries([post("only", "2026-01-01T12:00:00Z")], "only");

    expect(at.previous).toBeNull();
    expect(at.next).toBeNull();
  });

  test("an unknown slug gets no neighbours rather than the wrong ones", () => {
    const at = adjacentInSeries(posts, "a-draft-being-previewed");

    expect(at).toEqual({ previous: null, next: null, index: 0, total: 3 });
  });

  // A scheduled row can carry a null published_at. It must not end up looking
  // like the oldest post in the series, which is what Date.parse(null) would
  // make of it.
  test("a post with no date sorts last instead of first", () => {
    const withUndated = [...posts, post("undated", null)];

    expect(adjacentInSeries(withUndated, "third").next?.slug).toBe("undated");
    expect(adjacentInSeries(withUndated, "first").previous).toBeNull();
  });

  test("does not reorder the caller's array", () => {
    const original = [...posts];
    adjacentInSeries(posts, "second");

    expect(posts).toEqual(original);
  });
});
