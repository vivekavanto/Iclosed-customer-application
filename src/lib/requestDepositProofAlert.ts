import { adminAppUrl } from "@/lib/adminAppUrl";
import { signedServiceHeaders } from "@/lib/signServiceRequest";
import { isDepositTask } from "@/lib/depositTask";

/**
 * Tell the back office that a client has just sent their closing funds.
 *
 * The alert has to be SENT by the admin app, not from here: it carries the proof
 * of deposit as an attachment, and the blob-download plumbing that pulls a
 * document out of either store lives in that repo. So this posts the admin's
 * signed webhook and lets it do the work — the same delegation
 * requestAllTasksCompleteAlert uses, and for the same reason.
 *
 * There is no local fallback. Unlike the all-tasks alert, an alert without the
 * attachment isn't a degraded version of this one: the attachment IS the
 * message ("here is the client's proof"), and a clerk reading a bare
 * notification would still have to open the file. If the admin app can't be
 * reached we log loudly and leave it — the task is completed and visible on the
 * file either way, and the admin repo's log records the gap.
 *
 * Only fires for the deposit task. Callers may pass any completed task.
 *
 * Best-effort by contract: never throws, so it can't fail a task submission.
 */

/** How long to wait on the admin ack before giving up. */
const ACK_TIMEOUT_MS = 8000;

export async function requestDepositProofAlert(params: {
  taskId: string | null | undefined;
  taskTitle: string | null | undefined;
}): Promise<void> {
  const { taskId, taskTitle } = params;
  if (!taskId || !isDepositTask(taskTitle)) return;

  try {
    // Build the JSON string ONCE and send that exact string — the signature is
    // over the raw body, so re-serializing would produce a different payload.
    const rawBody = JSON.stringify({ task_id: taskId });

    const res = await fetch(`${adminAppUrl()}/api/webhooks/deposit-proof`, {
      method: "POST",
      headers: signedServiceHeaders(rawBody),
      body: rawBody,
      signal: AbortSignal.timeout(ACK_TIMEOUT_MS),
    });

    if (res.ok) return;

    console.error(
      `[DepositProof] admin webhook returned ${res.status} — the clerks were NOT emailed for task ${taskId}`,
    );
  } catch (err) {
    console.error(
      `[DepositProof] admin webhook unreachable — the clerks were NOT emailed for task ${taskId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
