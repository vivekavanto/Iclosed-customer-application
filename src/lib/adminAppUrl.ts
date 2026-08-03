/**
 * Base URL of the admin app for server-to-server calls.
 *
 * Why this exists: call sites used to inline
 * `process.env.ADMIN_APP_URL ?? "https://devadmin.iclosed.ca"`. That default is
 * silently WRONG on production — a prod deploy that never set ADMIN_APP_URL
 * posts its webhooks at the DEV admin app, which runs against the DEV database,
 * so the call succeeds (HTTP 200, "nothing to activate") and the work is simply
 * never done. That is exactly how the "your client signed up" agent email went
 * missing in production with no error anywhere.
 *
 * Resolution order:
 *   1. ADMIN_APP_URL / NEXT_PUBLIC_ADMIN_APP_URL — explicit wins, always.
 *   2. Derived from this deploy's own identity: a production portal points at
 *      the production admin, anything else at the dev admin.
 *
 * Set ADMIN_APP_URL in each Vercel environment; the derivation is a safety net,
 * not a substitute.
 */

const PROD_ADMIN = "https://admin.iclosed.ca";
const DEV_ADMIN = "https://devadmin.iclosed.ca";

function isProductionDeploy(): boolean {
  // A non-production Node build (local dev) is never the prod portal.
  if (process.env.NODE_ENV !== "production") return false;

  // Vercel preview/development deploys are never the prod portal either.
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "production") return false;

  // Finally, the portal's own public URL: dev/staging/preview hosts are not it.
  const portal = (process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL ?? "").toLowerCase();
  if (!portal) return false;
  if (/\/\/(dev|staging|test|preview|localhost)/.test(portal)) return false;

  return true;
}

/** Admin app base URL, never with a trailing slash. */
export function adminAppUrl(): string {
  const explicit = process.env.ADMIN_APP_URL || process.env.NEXT_PUBLIC_ADMIN_APP_URL;
  if (explicit?.trim()) return explicit.trim().replace(/\/+$/, "");

  const derived = isProductionDeploy() ? PROD_ADMIN : DEV_ADMIN;
  console.warn(
    `[adminAppUrl] ADMIN_APP_URL is not set — falling back to ${derived}. Set it in this environment.`,
  );
  return derived;
}
