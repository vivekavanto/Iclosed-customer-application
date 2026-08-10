"use client";

import { LAST_ACTIVITY_KEY, SESSION_START_KEY } from "./sessionPolicy";

/**
 * Client-side bookkeeping for the idle guard and the absolute session cap.
 *
 * THE BUG THIS FIXES: `iclosed:lastActivity` used to be written only by mouse /
 * key activity and cleared only by the idle guard's own auto-logout. Manual
 * logout left it behind and login never refreshed it — so logging out at 10am
 * and back in at 4pm made the guard read the stale 10am stamp on mount, decide
 * the user had been idle for six hours, and bounce them straight back to /login
 * with "Session Expired" on a session that was seconds old.
 */

/** Call right after a successful login: starts both the idle and absolute clocks. */
export function beginClientSession(now: number = Date.now()): void {
  try {
    localStorage.setItem(SESSION_START_KEY, String(now));
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {}
}

/** Call on EVERY logout path so nothing stale survives into the next login. */
export function endClientSession(): void {
  try {
    localStorage.removeItem(SESSION_START_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {}
}
