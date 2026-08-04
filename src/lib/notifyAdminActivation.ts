import { adminAppUrl } from "./adminAppUrl";
import { signedServiceHeaders } from "./signServiceRequest";

/**
 * Tells the admin app that this client's account is now active.
 *
 * The admin `activate-deal` webhook does two things with it:
 *   • promotes their Inactive deals to Active, and
 *   • sends the one-off "your client just signed up on iClosed" email to the
 *     referring agent/broker (idempotent — guarded by
 *     leads.agent_signup_email_sent, so calling this more than once is safe).
 *
 * Call it at EVERY point a client's account becomes usable — the moment they
 * set their password (the real sign-up) and on password login. Setting the
 * password alone used to notify nobody: the deal still flipped to Active
 * because a Postgres trigger does that on first sign-in, so the file looked
 * activated in the admin UI while no HTTP call ever reached the admin app and
 * the agent email never fired.
 *
 * Best-effort by contract: never throws and is time-boxed, so a slow or
 * unreachable admin app can never stall or fail an auth flow.
 */
export async function notifyAdminActivation(
  email: string,
  context: string,
): Promise<void> {
  if (!email) return;

  try {
    const body = JSON.stringify({ email });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${adminAppUrl()}/api/webhooks/activate-deal`, {
      method: "POST",
      headers: signedServiceHeaders(body),
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      console.warn(
        `[${context}] activate-deal webhook returned ${res.status} (non-blocking)`,
      );
    }
  } catch (err) {
    console.warn(`[${context}] activate-deal webhook failed (non-blocking):`, err);
  }
}
