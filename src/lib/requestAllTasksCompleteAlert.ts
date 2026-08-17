import { adminAppUrl } from "@/lib/adminAppUrl";
import { signedServiceHeaders } from "@/lib/signServiceRequest";
import { notifyAllTasksComplete } from "@/lib/notifyAllTasksComplete";

/**
 * Trigger the back-office "this client is done" alert after a CLIENT completes
 * a task here.
 *
 * Why this delegates instead of sending from the portal:
 *
 * Both repos can send this alert (whoever completes the last task sends it),
 * and they share one idempotency claim — `deals.all_tasks_notified_at` — so
 * they can never double-send. But the two senders were NOT equivalent: the
 * admin app attaches the family's whole document package to the email, and this
 * one sent the body alone. Since a client finishing their tasks is the common
 * case, the alert that mattered most was the one arriving without the documents
 * it announces. Posting the admin's existing signed webhook makes every alert
 * identical, rather than duplicating the attachment builder into this repo.
 *
 * The admin route acknowledges immediately and does the work in `after()`, so
 * this costs one fast round-trip inside the client's task submission, not the
 * document downloads.
 *
 * Fallback: if the admin app can't be reached, or rejects us (bad/missing
 * signature), we send locally as before. That path takes the claim, so an alert
 * still lands — just without attachments. It cannot double-send with a request
 * the admin actually accepted: the admin claims before doing any work, so a
 * fallback that runs after a *successful* trigger reads the claim and no-ops.
 *
 * Best-effort by contract: never throws, so it can't fail a task submission.
 */

/** How long to wait on the admin ack before falling back. */
const ACK_TIMEOUT_MS = 8000;

export async function requestAllTasksCompleteAlert(
  dealId: string | null | undefined,
): Promise<void> {
  if (!dealId) return;

  try {
    // Build the JSON string ONCE and send that exact string — the signature is
    // over the raw body, so re-serializing would produce a different payload.
    const rawBody = JSON.stringify({ deal_id: dealId });

    const res = await fetch(`${adminAppUrl()}/api/webhooks/tasks-complete`, {
      method: "POST",
      headers: signedServiceHeaders(rawBody),
      body: rawBody,
      signal: AbortSignal.timeout(ACK_TIMEOUT_MS),
    });

    if (res.ok) return;

    console.warn(
      `[AllTasksComplete] admin webhook returned ${res.status} — sending locally instead (no attachments)`,
    );
  } catch (err) {
    console.warn(
      "[AllTasksComplete] admin webhook unreachable — sending locally instead (no attachments):",
      err instanceof Error ? err.message : err,
    );
  }

  await notifyAllTasksComplete(dealId);
}
