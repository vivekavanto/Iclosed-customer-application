/** Client feature flags: env var wins, else decided by deploy. */

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

/** Closing cost estimate card; on everywhere, env "false" hides it. */
export const SHOW_CLOSING_COST_ESTIMATE =
  envFlag(process.env.NEXT_PUBLIC_SHOW_CLOSING_COST_ESTIMATE) ?? true;

/** Digits in intake names, for test data; dev only by default. */
export const ALLOW_DIGITS_IN_NAMES =
  envFlag(process.env.NEXT_PUBLIC_ALLOW_DIGITS_IN_NAMES) ??
  isNonProductionDeploy();

// Sign out when the APS doesn't name the client.
export const ENFORCE_APS_NAME_MATCH =
  envFlag(process.env.NEXT_PUBLIC_ENFORCE_APS_NAME_MATCH) ??
  !isNonProductionDeploy();
