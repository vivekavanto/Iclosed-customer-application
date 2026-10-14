import type { MetadataRoute } from "next";
import { siteUrl, isProductionSite } from "@/lib/siteUrl";

/**
 * /robots.txt
 *
 * The important line here is the non-production branch. dev.iclosed.ca is a
 * live public hostname serving a full copy of the blog, and left crawlable it
 * would compete with the real site for the firm's own keywords — a
 * self-inflicted duplicate-content problem that is far easier to prevent than
 * to undo once the wrong host is the one ranking. isProductionSite() already
 * encodes that judgement; this is the first thing to use it.
 *
 * Note that robots.txt governs CRAWLING, not indexing: a disallowed URL can
 * still be indexed from an inbound link. The blog pages carry their own
 * `robots` metadata for the indexing half (see generateMetadata in
 * src/app/blogs/[slug]/page.tsx), and the two work together.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  if (!isProductionSite()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/admin/",
          "/dashboard",
          "/dashboard/",
          "/intake",
          "/intake/",
          "/login",
          "/lender/login",
          "/set-password",
          "/reset-link-sent",
          "/forgot-password",
          "/documents",
          "/details",
          "/profile",
          "/retainer",
          "/signing",
          "/quote",
          "/book-appointment",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
