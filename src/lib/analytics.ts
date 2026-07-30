import posthog from "posthog-js";

// Survives the full page reload every logout path ends with, so we can tell
// "same person returning" from "different person on this browser".
const LAST_ID_KEY = "ph_last_client_id";

function readLastId(): string | null {
  try {
    return localStorage.getItem(LAST_ID_KEY);
  } catch {
    return null;
  }
}

function writeLastId(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_ID_KEY, id);
    else localStorage.removeItem(LAST_ID_KEY);
  } catch {}
}

/**
 * Counts people rather than browsers. UUID only — never name or email.
 *
 * Resets first when a different client appears on this browser: identify()ing
 * over a live identity makes PostHog merge the two people into one, so the new
 * user's activity lands on the previous user's session and recording.
 */
export function identifyUser(clientId: string | null | undefined) {
  if (!clientId || !posthog.__loaded) return;

  const lastId = readLastId();
  if (lastId === clientId) return;
  if (lastId) posthog.reset();

  posthog.identify(clientId);
  writeLastId(clientId);
}

/** Ends the analytics session on logout so the next user starts a clean recording. */
export function resetUser() {
  writeLastId(null);
  if (!posthog.__loaded) return;
  posthog.reset();
}
