/**
 * Identifies the two per-party tasks (Personal Information / Upload
 * Identification) that, on a deal with a co-purchaser/co-seller, are filled per
 * person and shown complete only when every involved party's section is done.
 *
 * Detection is by title (case-insensitive substring), matching how the dashboard
 * routes task clicks in dashboard/page.tsx. Centralised here so the drawers,
 * dashboard and family-task-status route agree on what counts as a per-party task.
 */

export function isPersonalInfoTask(title: string | null | undefined): boolean {
  // Match any personal-information task title — "Personal Information", "Provide
  // Personal Information", "Personal Info", … — via the "personal info" substring
  // (it's contained in "personal information"), mirroring the admin panel
  // (DealDetail.tsx gates on `includes("personal info")`). Prod deals titled just
  // "Personal Information" (no "Provide") were previously dropped from per-party
  // detection, so their co-party status accordion never showed. See the parallel
  // fix for identification tasks below.
  return (title ?? "").toLowerCase().includes("personal info");
}

export function isUploadIdTask(title: string | null | undefined): boolean {
  // Match any identification task title — "Identification", "Upload
  // Identification", … — via the "identif" substring, mirroring the admin panel
  // (DealDetail.tsx / clone-from-previous both gate on `includes("identif")`).
  // The task was renamed from "Upload Identification" to "Identification", which
  // silently dropped it out of per-party detection here: the dashboard stopped
  // fetching family-task-status for it (so the co-party "others" status vanished)
  // and it fell through to the generic drawer instead of UploadIdentificationDrawer.
  return (title ?? "").toLowerCase().includes("identif");
}

// Added per person when anyone on the file picks virtual signing (src/lib/treefortTask.ts).
export function isTreefortTask(title: string | null | undefined): boolean {
  return (title ?? "").toLowerCase().includes("treefort");
}

export function isPerPartyTask(title: string | null | undefined): boolean {
  return isPersonalInfoTask(title) || isUploadIdTask(title) || isTreefortTask(title);
}

/** Number of verified IDs a party must upload (the drawer enforces "two verified IDs"). */
export const REQUIRED_ID_DOCS = 2;

/** One shared decision for the whole transaction — any party may answer it. */
// Renamed "How Will You Hold Title?" → "Ownership shares"; both still match.
export function isHoldTitleTask(title: string | null | undefined): boolean {
  const t = (title ?? "").toLowerCase();
  return t.includes("hold title") || t.includes("ownership shares");
}

/** Purchase task added only for resale condos. */
export function isStatusCertificateTask(title: string | null | undefined): boolean {
  return (title ?? "").toLowerCase().includes("status certificate");
}

export function isPropertyDetailsTask(title: string | null | undefined): boolean {
  return (title ?? "").toLowerCase().includes("property details");
}

/** Locked on the dashboard until every other to-do is done. */
export function isClosingFiguresTask(title: string | null | undefined): boolean {
  return (title ?? "").toLowerCase().includes("closing figures");
}

/** Listed under the dashboard's "After closing" section. */
export function isAfterClosingTask(title: string | null | undefined): boolean {
  return (title ?? "").toLowerCase().includes("utilities");
}

/** Matched by label: a select's `options` holds its choice list, so there is
 * nowhere on it for a multi_party_only flag. */
export function isHoldTitleField(label: string | null | undefined): boolean {
  const l = (label ?? "").toLowerCase();
  return l.includes("how would you like to hold title") || (l.includes("hold title") && l.includes("tenants in common"));
}
