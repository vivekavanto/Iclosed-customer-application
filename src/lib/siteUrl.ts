/**
 * This site's own public base URL.
 *
 * Needed because Next drops relative Open Graph and canonical URLs unless
 * `metadataBase` is set on the root metadata — silently. The blog's social
 * preview images and canonical tags are emitted as site-relative paths, so
 * without this they simply do not appear in the rendered head, and the failure
 * shows up as "LinkedIn won't preview our posts" weeks later rather than as an
 * error anyone can see.
 *
 * Resolution order mirrors adminAppUrl(): an explicit environment variable
 * wins, then this deploy's own identity, and the fallback is the DEV host —
 * never production. Guessing "production" for an unconfigured deploy is the
 * dangerous direction: it would stamp dev-rendered pages with canonical URLs
 * pointing at the live site.
 */

const DEV_SITE = "https://dev.iclosed.ca";

/** The portal's public base URL, never with a trailing slash. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL;
  if (explicit?.trim()) return explicit.trim().replace(/\/+$/, "");

  // Vercel gives every deploy its own hostname; better a correct preview URL
  // than a wrong guess at the canonical host.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel?.trim()) return `https://${vercel.trim().replace(/\/+$/, "")}`;

  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";

  console.warn(
    `[siteUrl] NEXT_PUBLIC_CUSTOMER_PORTAL_URL is not set — falling back to ${DEV_SITE}. Set it in this environment.`,
  );
  return DEV_SITE;
}

/**
 * True only for the real production site.
 *
 * Used to decide whether this deploy may be indexed at all: dev.iclosed.ca is a
 * live public hostname, and a dev copy of the blog competing with the real one
 * in search results is a self-inflicted duplicate-content problem.
 */
export function isProductionSite(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return false;

  const host = siteUrl().toLowerCase();
  if (/\/\/(dev|staging|test|preview|localhost)/.test(host)) return false;
  return true;
}
