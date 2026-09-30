import supabaseAdmin from "./supabaseAdmin";
import { sanitizeBlogHtml, readingTimeFromHtml } from "./sanitizeBlogHtml";
import { slugify } from "./blogSlug";

export { slugify };

/**
 * Every read and write of the blog goes through here.
 *
 * All of it runs on the service-role client, which is why `blog_posts` has RLS
 * on with no policies and no anon grant (see sql/create_blog_posts.sql for the
 * reasoning). Every blog page is a Server Component, so the browser never needs
 * to query the table itself.
 */

export type BlogStatus = "draft" | "scheduled" | "published";
export type ContentSource = "manual" | "gemini" | "gemini_edited";

/** A row as it exists in the table. */
export type BlogPostRow = {
  id: string;
  created_at: string;
  updated_at: string;
  slug: string;
  status: BlogStatus;
  published_at: string | null;
  title: string;
  excerpt: string | null;
  content_html: string | null;
  content_source: string | null;
  reading_time_min: number | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  author: string;
  tags: string[];
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  og_image_url: string | null;
  focus_keyword: string | null;
  faq: { question: string; answer: string }[];
  noindex: boolean;
  seo_source: ContentSource;
  format_source: ContentSource;
  formatted_at: string | null;
  format_model: string | null;
  created_by_email: string | null;
  updated_by_email: string | null;
  import_batch_id: string | null;
};

/**
 * What a page renders. Deliberately shaped like the old blogData.ts `BlogPost`
 * — same field names, same types — so the three page components that used to
 * read the hardcoded array did not have to be rewritten around a new shape.
 */
export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** Pre-formatted for display, e.g. "May 17, 2026". */
  date: string;
  /** ISO, for <time> and for structured data. */
  publishedAt: string | null;
  updatedAt: string;
  readTime: string;
  /**
   * The picture that represents this post: the uploaded cover, or — when the
   * post has none — the first image in its own body. Null only when the post
   * contains no image at all. There is no house stand-in.
   */
  image: string | null;
  imageAlt: string;
  /**
   * True when `image` was borrowed from the body rather than uploaded as a
   * cover. The article page uses it to skip the hero, so a body image is not
   * printed twice on the one page that also renders the body.
   */
  imageFromContent: boolean;
  author: string;
  tags: string[];
  /** Sanitized. Safe to hand to dangerouslySetInnerHTML. */
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
  faq: { question: string; answer: string }[];
  noindex: boolean;
};

const SELECT_COLS = `
  id, created_at, updated_at, slug, status, published_at,
  title, excerpt, content_html, content_source, reading_time_min,
  cover_image_url, cover_image_alt, author, tags,
  meta_title, meta_description, canonical_url, og_image_url, focus_keyword,
  faq, noindex, seo_source, format_source, formatted_at, format_model,
  created_by_email, updated_by_email, import_batch_id
`;

function formatDisplayDate(iso: string | null): string {
  if (!iso) return "";
  // UTC on purpose: the seeded posts are stored at noon UTC precisely so that
  // this renders the same date for every reader, and a server in a different
  // region does not shift a publication date by a day.
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The src of the first <img> in an article body.
 *
 * The fallback for a post whose author uploaded pictures into the article but
 * never set a cover — which used to leave a blank space where the card art
 * goes. Borrowing from the post itself is safe in the way a house fallback was
 * not: the picture is about this post, so two unrelated articles can never end
 * up wearing the same one.
 *
 * Runs on sanitized HTML, so the src has already been through the sanitizer's
 * allowed-scheme check before anything renders it.
 */
function firstContentImage(html: string): { src: string; alt: string } | null {
  const tag = /<img\b[^>]*>/i.exec(html);
  if (!tag) return null;

  const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag[0]);
  if (!src?.[1]) return null;

  const alt = /\salt\s*=\s*["']([^"']*)["']/i.exec(tag[0]);
  return { src: src[1], alt: alt?.[1]?.trim() || "" };
}

export function toBlogPost(row: BlogPostRow): BlogPost {
  // Sanitized here, on the read path, rather than trusting what is stored.
  // The three migrated rows predate the sanitizer entirely, and the separate
  // admin app can write to this table without passing through our routes.
  const content = sanitizeBlogHtml(row.content_html);

  // Only looked up when there is no cover — the ordinary case is an uploaded
  // cover, and that path should not scan the body at all.
  const borrowed = row.cover_image_url ? null : firstContentImage(content);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    date: formatDisplayDate(row.published_at ?? row.created_at),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    readTime: `${row.reading_time_min ?? readingTimeFromHtml(content)} min read`,
    // No house fallback. A post used to borrow /blog1.png when it had no
    // cover of its own, which put the same stock picture on unrelated
    // articles and made the listing read as one repeated post. The fallback
    // below is the post's OWN first image, which cannot repeat that way; every
    // surface still checks for null and lays out without one.
    image: row.cover_image_url ?? borrowed?.src ?? null,
    // The cover's alt describes the cover; a borrowed picture brings its own.
    imageAlt: row.cover_image_url
      ? row.cover_image_alt ?? row.title
      : borrowed?.alt || row.title,
    imageFromContent: !row.cover_image_url && borrowed !== null,
    author: row.author,
    tags: Array.isArray(row.tags) ? row.tags : [],
    content,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    canonicalUrl: row.canonical_url,
    ogImageUrl: row.og_image_url,
    faq: Array.isArray(row.faq) ? row.faq : [],
    noindex: row.noindex,
  };
}

/**
 * The published-post filter, in one place.
 *
 * `scheduled` rows whose time has come are treated as published rather than
 * needing a cron to flip them. The pages revalidate on a timer, so a scheduled
 * post appears within that window with no infrastructure at all. Revisit if
 * "publishes at exactly 09:00" ever becomes a real requirement.
 */
function publishedFilter<T>(q: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = q as any;
  return query
    .in("status", ["published", "scheduled"])
    .lte("published_at", new Date().toISOString()) as T;
}

/**
 * Every published post, in reading order: oldest first.
 *
 * The blog is written as a series — each article ends by pointing at the next
 * one, and BlogSeriesNav derives that pointer from publication order — so a
 * newest-first listing printed the run backwards: the last instalment sat at
 * the top of /blogs as the featured card, and a reader who started there was
 * shown a "Previous" link and no "Next". The listing and the series navigation
 * now agree, and the featured card is the first article in the series.
 *
 * The tie-break on slug matches inReadingOrder() in blogSeries.ts. It matters
 * because a bulk import stamps a whole batch within the same second; without
 * it the two could disagree, which is the one thing this ordering exists to
 * prevent.
 */
export async function listPublishedPosts(): Promise<BlogPost[]> {
  const { data, error } = await publishedFilter(
    supabaseAdmin.from("blog_posts").select(SELECT_COLS),
  )
    .order("published_at", { ascending: true })
    .order("slug", { ascending: true });

  if (error) {
    console.error("[blogPosts] listPublishedPosts failed:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as BlogPostRow[]).map(toBlogPost);
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  const { data, error } = await publishedFilter(
    supabaseAdmin.from("blog_posts").select(SELECT_COLS).ilike("slug", slug),
  ).maybeSingle();

  if (error) {
    console.error(`[blogPosts] getPublishedPost(${slug}) failed:`, error.message);
    return null;
  }
  return data ? toBlogPost(data as unknown as BlogPostRow) : null;
}

/** Slugs for generateStaticParams. Published only — drafts must not prerender. */
export async function listPublishedSlugs(): Promise<string[]> {
  const { data, error } = await publishedFilter(
    supabaseAdmin.from("blog_posts").select("slug, status, published_at"),
  );

  if (error) {
    console.error("[blogPosts] listPublishedSlugs failed:", error.message);
    return [];
  }
  return ((data ?? []) as { slug: string }[]).map((r) => r.slug);
}

/** Admin list — every status. */
export async function listAllPosts(): Promise<BlogPostRow[]> {
  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select(SELECT_COLS)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[blogPosts] listAllPosts failed:", error.message);
    return [];
  }
  return (data ?? []) as unknown as BlogPostRow[];
}

export async function getPostById(id: string): Promise<BlogPostRow | null> {
  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select(SELECT_COLS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`[blogPosts] getPostById(${id}) failed:`, error.message);
    return null;
  }
  return (data as unknown as BlogPostRow) ?? null;
}

/**
 * A slug not already taken, suffixing -2, -3 … on collision.
 *
 * Checked case-insensitively because the unique index is on lower(slug):
 * without the ilike this would happily hand back a slug that the insert then
 * rejects.
 */
export async function uniqueSlug(desired: string, excludeId?: string): Promise<string> {
  const base = slugify(desired) || "post";

  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    let q = supabaseAdmin.from("blog_posts").select("id").ilike("slug", candidate);
    if (excludeId) q = q.neq("id", excludeId);

    const { data } = await q.maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export type BlogPostWrite = Partial<
  Omit<BlogPostRow, "id" | "created_at" | "updated_at">
>;

export async function createPost(
  fields: BlogPostWrite,
  adminEmail: string,
): Promise<{ ok: true; row: BlogPostRow } | { ok: false; error: string }> {
  const title = (fields.title ?? "").trim();
  if (!title) return { ok: false, error: "A title is required." };

  const slug = await uniqueSlug(fields.slug || title);
  const content_html = sanitizeBlogHtml(fields.content_html);

  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .insert({
      ...fields,
      title,
      slug,
      content_html,
      reading_time_min: fields.reading_time_min ?? readingTimeFromHtml(content_html),
      status: fields.status ?? "draft",
      created_by_email: adminEmail,
      updated_by_email: adminEmail,
    })
    .select(SELECT_COLS)
    .single();

  if (error) {
    console.error("[blogPosts] createPost failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, row: data as unknown as BlogPostRow };
}

export async function updatePost(
  id: string,
  fields: BlogPostWrite,
  adminEmail: string,
): Promise<{ ok: true; row: BlogPostRow } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = {
    ...fields,
    updated_by_email: adminEmail,
    updated_at: new Date().toISOString(),
  };

  if (typeof fields.slug === "string" && fields.slug.trim()) {
    patch.slug = await uniqueSlug(fields.slug, id);
  }

  if (typeof fields.content_html === "string") {
    const clean = sanitizeBlogHtml(fields.content_html);
    patch.content_html = clean;
    patch.reading_time_min = fields.reading_time_min ?? readingTimeFromHtml(clean);
  }

  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .update(patch)
    .eq("id", id)
    .select(SELECT_COLS)
    .single();

  if (error) {
    console.error(`[blogPosts] updatePost(${id}) failed:`, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, row: data as unknown as BlogPostRow };
}

export async function deletePost(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin.from("blog_posts").delete().eq("id", id);
  if (error) {
    console.error(`[blogPosts] deletePost(${id}) failed:`, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
