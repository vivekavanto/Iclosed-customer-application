"use client";

import { useEffect, useState } from "react";

const DEFAULT_IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const IDLE_TIMEOUT_MS =
  Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MS) || DEFAULT_IDLE_TIMEOUT_MS;
const STORAGE_KEY = "iclosed:lastActivity";
const CHECK_INTERVAL_MS = 60_000;
const ACTIVITY_THROTTLE_MS = 5_000;
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

    const expireSession = async () => {
      if (loggingOut) return;
      loggingOut = true;
      setShowExpired(true);
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {}
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      window.setTimeout(() => {
        window.location.href = "/login";
      }, MODAL_VISIBLE_MS);
    };

    const checkIdle = () => {
      const last = readLastActivity();
      if (last > 0 && Date.now() - last > IDLE_TIMEOUT_MS) {
        void expireSession();
      }
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastWriteAt < ACTIVITY_THROTTLE_MS) return;
      writeNow();
    };

    const onSessionExpiredEvent = () => {
      void expireSession();
    };

    const initial = readLastActivity();
    if (initial > 0 && Date.now() - initial > IDLE_TIMEOUT_MS) {
      void expireSession();
      return;
    }
    if (initial === 0) writeNow();

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, onActivity, { passive: true }),
    );
    const intervalId = window.setInterval(checkIdle, CHECK_INTERVAL_MS);
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpiredEvent);

    // Intercept same-origin /api/* fetches and trigger the modal on 401.
    const originalFetch = window.fetch.bind(window);
    const patchedFetch: typeof window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      try {
        if (response.status === 401) {
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
