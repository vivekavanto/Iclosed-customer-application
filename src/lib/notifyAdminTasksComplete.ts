import { signedServiceHeaders } from "./signServiceRequest";

/**
 * Ping the admin app after a client completes a task, so the back office can be
 * told when this client AND their co-party have finished everything on the file.
 *
 * Why this exists: we complete tasks straight against the shared Supabase DB and
 * run our own `advanceMilestone` — the admin app never sees a client-driven
 * completion. Its "all tasks complete" alert (email to every admin + in-app
 * notification) therefore has no way to fire without this nudge.
 *
 * Deliberately dumb: we send the deal id on EVERY completion and let the admin
 * decide. It re-reads the whole co-purchaser/co-seller family from the DB, works
 * out whether everything is genuinely done, and holds its own idempotency claim
 * so repeat pings are cheap no-ops. Nothing about "are we finished?" is
 * duplicated across the two repos.
 *
 * Best-effort and time-boxed, exactly like the activate-deal webhook: a slow or
 * unreachable admin app must never stall or fail a client's task submission.
 */
export async function notifyAdminTasksComplete(dealId: string | null | undefined): Promise<void> {
  if (!dealId) return;

  try {
    const adminBase = (
      process.env.ADMIN_APP_URL ?? "https://devadmin.iclosed.ca"
    ).replace(/\/+$/, "");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    // Build the body string once and reuse it for signing AND the fetch body —
    // re-serializing would change the bytes and break the HMAC (SEC-002).
    const body = JSON.stringify({ deal_id: dealId });

    await fetch(`${adminBase}/api/webhooks/tasks-complete`, {
      method: "POST",
      headers: signedServiceHeaders(body),
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch (err) {
    console.warn("[TasksComplete] admin webhook failed (non-blocking):", err);
  }
}
