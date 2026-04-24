"use client";

import { useEffect } from "react";

const IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const STORAGE_KEY = "iclosed:lastActivity";
const CHECK_INTERVAL_MS = 60_000;
const ACTIVITY_THROTTLE_MS = 5_000;
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

export default function IdleLogoutGuard() {
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
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {}
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      window.location.href = "/login";
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

  return null;
}
