"use client";

import { useEffect, useState } from "react";

const IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const STORAGE_KEY = "iclosed:lastActivity";
const CHECK_INTERVAL_MS = 60_000;
const ACTIVITY_THROTTLE_MS = 5_000;
const MODAL_VISIBLE_MS = 2500;
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

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

    const logout = async () => {
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
        void logout();
      }
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastWriteAt < ACTIVITY_THROTTLE_MS) return;
      writeNow();
    };

    const initial = readLastActivity();
    if (initial > 0 && Date.now() - initial > IDLE_TIMEOUT_MS) {
      void logout();
      return;
    }
    if (initial === 0) writeNow();

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, onActivity, { passive: true }),
    );
    const intervalId = window.setInterval(checkIdle, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
      window.clearInterval(intervalId);
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
