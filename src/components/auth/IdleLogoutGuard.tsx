"use client";

import { useEffect, useState } from "react";
import { resetUser } from "@/lib/analytics";
import {
  LAST_ACTIVITY_KEY,
  SESSION_EXPIRED_HEADER,
  SESSION_MAX_AGE_MS,
  SESSION_START_KEY,
} from "@/lib/sessionPolicy";
import { endClientSession } from "@/lib/sessionClient";

const DEFAULT_IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const IDLE_TIMEOUT_MS =
  Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MS) || DEFAULT_IDLE_TIMEOUT_MS;
const STORAGE_KEY = LAST_ACTIVITY_KEY;
// Poll at ~quarter of the timeout so short (test) timeouts fire promptly,
// capped between 2s and 60s.
const CHECK_INTERVAL_MS = Math.max(
  2_000,
  Math.min(60_000, Math.floor(IDLE_TIMEOUT_MS / 4)),
);
const ACTIVITY_THROTTLE_MS = Math.min(5_000, Math.floor(IDLE_TIMEOUT_MS / 6));
const MODAL_VISIBLE_MS = 2500;
const SESSION_EXPIRED_EVENT = "iclosed:session-expired";
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

// Same-origin /api/* calls that should NOT trigger the session-expired modal
// when they return 401 (e.g. the login form's own auth check).
const AUTH_401_IGNORE_PATHS = ["/api/auth/login", "/api/auth/logout"];

function isIgnoredAuthPath(pathname: string): boolean {
  return AUTH_401_IGNORE_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * Does this 401 actually mean the session died?
 *
 * It used to be assumed that ANY same-origin /api/* 401 was an expiry, which is
 * how users got logged out of perfectly valid sessions: getAuthUser() returns
 * null on any thrown error (a transient network blip reaching Supabase is
 * enough), getAuthClient() returns null for an admin_users email or a failed
 * client insert, and every one of those paths answers 401. Only the middleware
 * can tell a dead session from an unrelated authorization failure, so we trust
 * the header it sets and nothing else.
 */
function isSessionExpiry(response: Response): boolean {
  return response.headers.get(SESSION_EXPIRED_HEADER) === "1";
}

// The retainer link emailed to a brand-new customer (/retainer?token=…) is an
// ACCOUNT-FREE page: it is opened with NO session, yet it renders inside the
// authenticated dashboard layout, which fires authenticated calls such as
// /api/auth/me. Those 401 by design here, so they must NOT trigger the
// "Session Expired" auto-logout. While we are on that page we suppress the
// expiry entirely. Logged-in users reach /retainer WITHOUT a token, so a real
// session expiry is still handled normally.
function isAccountFreePage(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.pathname === "/retainer" &&
    new URLSearchParams(window.location.search).has("token")
  );
}

export default function IdleLogoutGuard() {
  const [showExpired, setShowExpired] = useState(false);

  useEffect(() => {
    let loggingOut = false;
    let lastWriteAt = 0;

    const readLastActivity = (): number => {
      const raw = localStorage.getItem(STORAGE_KEY);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? n : 0;
    };

    const writeNow = () => {
      const now = Date.now();
      lastWriteAt = now;
      try {
        localStorage.setItem(STORAGE_KEY, String(now));
      } catch {}
    };

    const readSessionStart = (): number => {
      const raw = localStorage.getItem(SESSION_START_KEY);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? n : 0;
    };

    const expireSession = async () => {
      if (loggingOut) return;
      // Never auto-logout an account-free page (e.g. the emailed retainer link):
      // there is no session to expire, and 401s there are expected.
      if (isAccountFreePage()) return;
      loggingOut = true;
      setShowExpired(true);
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {}
      endClientSession();
      resetUser();
      window.setTimeout(() => {
        window.location.href = "/login";
      }, MODAL_VISIBLE_MS);
    };

    // Two independent reasons to end a session:
    //   • idle    — no interaction for IDLE_TIMEOUT_MS
    //   • expired — SESSION_MAX_AGE_MS since login, however active the user was
    // The absolute cap is enforced server-side in middleware; mirroring it here
    // means a user parked on a page (making no requests, so middleware never
    // runs) is still logged out on time instead of at their next click.
    // Returns true when the session was ended, so the caller can bail out.
    const checkExpiry = (): boolean => {
      const at = Date.now();

      const start = readSessionStart();
      if (start > 0 && at - start >= SESSION_MAX_AGE_MS) {
        void expireSession();
        return true;
      }

      const last = readLastActivity();
      if (last > 0 && at - last > IDLE_TIMEOUT_MS) {
        void expireSession();
        return true;
      }

      return false;
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastWriteAt < ACTIVITY_THROTTLE_MS) return;
      writeNow();
    };

    const onSessionExpiredEvent = () => {
      void expireSession();
    };

    const now = Date.now();

    // The invite / magic-link / set-password flows establish their session in
    // the browser and never pass through the login form, so nothing stamped a
    // start time. Do it on first mount — same grace the middleware gives the
    // deadline cookie, so those users get a full window rather than no cap.
    if (readSessionStart() === 0) {
      try {
        localStorage.setItem(SESSION_START_KEY, String(now));
      } catch {}
    }

    // Evaluate BOTH clocks on mount, not just the idle one — a reload after the
    // absolute cap has passed must end the session immediately rather than wait
    // for the next poll tick.
    if (checkExpiry()) return;
    if (readLastActivity() === 0) writeNow();

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, onActivity, { passive: true }),
    );
    const intervalId = window.setInterval(checkExpiry, CHECK_INTERVAL_MS);
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpiredEvent);

    // Intercept same-origin /api/* fetches and trigger the modal on 401.
    const originalFetch = window.fetch.bind(window);
    const patchedFetch: typeof window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      try {
        if (response.status === 401 && isSessionExpiry(response)) {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input instanceof Request
                  ? input.url
                  : "";
          const parsed = new URL(url, window.location.origin);
          if (
            parsed.origin === window.location.origin &&
            parsed.pathname.startsWith("/api/") &&
            !isIgnoredAuthPath(parsed.pathname)
          ) {
            window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
          }
        }
      } catch {}
      return response;
    };
    window.fetch = patchedFetch;

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
      window.clearInterval(intervalId);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpiredEvent);
      if (window.fetch === patchedFetch) {
        window.fetch = originalFetch;
      }
    };
  }, []);

  if (!showExpired) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="w-[92%] max-w-md rounded-2xl bg-white p-8 shadow-2xl text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#FEF2F2]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="#C10007"
            className="h-8 w-8"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6l4 2m5-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </div>

        <h2
          id="session-expired-title"
          className="text-xl font-semibold text-gray-900"
        >
          Session Expired
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Your session has expired. You will be logged out and redirected to the
          login page.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500">
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-[#C10007]"
            aria-hidden="true"
          />
          Logging out...
        </div>
      </div>
    </div>
  );
}
