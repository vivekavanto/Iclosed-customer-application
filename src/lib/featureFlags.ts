/**
 * Client-visible feature flags.
 *
 * Why this exists: some work lands on the dev site long before it is allowed to
 * appear on the production portal, and "keep it commented out on main" does not
 * survive a dev → main merge — the merge brings the un-commented code with it.
 * A flag ships the code to both branches and lets the *deploy* decide.
 *
 * Resolution order (same shape as `adminAppUrl`):
 *   1. NEXT_PUBLIC_SHOW_CLOSING_COST_ESTIMATE — explicit wins, always
 *      ("true"/"1" shows it, "false"/"0" hides it).
 *   2. Derived from this deploy's own identity: shown everywhere EXCEPT a
 *      deploy that looks like the real production portal.
 *
 * The derivation fails safe toward hidden: anything that cannot be positively
 * identified as local / preview / dev is treated as production.
 */

function envFlag(raw: string | undefined): boolean | null {
  const value = raw?.trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

/** True when this deploy is anything other than the live production portal. */
function isNonProductionDeploy(): boolean {
  // Local dev build.
  if (process.env.NODE_ENV !== "production") return true;

  // Vercel preview / development deploys.
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  if (vercelEnv === "preview" || vercelEnv === "development") return true;

  // The portal's own public URL: dev/staging/preview hosts are not production,
  // even when they run as a "production" deploy of their own Vercel project.
  const portal = (process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL ?? "").toLowerCase();
  if (/\/\/(dev|staging|test|preview|localhost)/.test(portal)) return true;

  return false;
}

/**
 * "Estimate your closing cost" card on the client dashboard — dev only for now.
 * Set NEXT_PUBLIC_SHOW_CLOSING_COST_ESTIMATE=true to force it on anywhere.
 */
export const SHOW_CLOSING_COST_ESTIMATE =
  envFlag(process.env.NEXT_PUBLIC_SHOW_CLOSING_COST_ESTIMATE) ??
  isNonProductionDeploy();

/** Digits in intake names, for test data; dev only by default. */
export const ALLOW_DIGITS_IN_NAMES =
  envFlag(process.env.NEXT_PUBLIC_ALLOW_DIGITS_IN_NAMES) ??
  isNonProductionDeploy();

// Sign out when the APS doesn't name the client.
export const ENFORCE_APS_NAME_MATCH =
  envFlag(process.env.NEXT_PUBLIC_ENFORCE_APS_NAME_MATCH) ??
  !isNonProductionDeploy();
