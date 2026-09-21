import type { MetadataRoute } from "next";
import { listPublishedPosts } from "@/lib/blogPosts";
import { siteUrl } from "@/lib/siteUrl";

/**
 * /sitemap.xml — the indexable public surface of this site.
 *
 * Only pages a search engine should actually crawl. Login, password reset,
 * set-password and the intake flow are all deliberately absent: they are
 * either behind auth, single-use token URLs, or duplicate thin pages, and an
 * indexed /set-password is a genuinely bad outcome rather than a cosmetic one.
 *
 * Posts come from the same listPublishedPosts() the blog pages read, so a
 * scheduled post whose time has passed appears here on the same terms it
 * appears on /blogs — there is no second definition of "live" to drift.
 *
 * `noindex` rows are filtered out. A URL that is in the sitemap AND carries
 * <meta name="robots" content="noindex"> is a contradiction Search Console
 * reports as an error, so the two have to agree.
 */

// Matches the blog pages' own revalidate. Without this the sitemap would be
// baked at build time and a post published afterwards would stay missing from
// it until the next deploy — the exact thing generateStaticParams' dynamicParams
// note is guarding against on the page side.
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/blogs`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/closing-cost-calculator`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/contact`, changeFrequency: "yearly", priority: 0.5 },
  ];

  const posts = await listPublishedPosts();

  const postRoutes: MetadataRoute.Sitemap = posts
    .filter((p) => !p.noindex)
    .map((p) => ({
      url: `${base}/blogs/${p.slug}`,
      // updatedAt, not publishedAt: lastmod is meant to tell a crawler when the
      // content last changed, and a post edited after publication is exactly
      // the case worth re-crawling.
      lastModified: new Date(p.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  return [...staticRoutes, ...postRoutes];
}
