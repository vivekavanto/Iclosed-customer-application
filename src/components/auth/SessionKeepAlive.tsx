"use client";

import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Keeps the Supabase session alive while the user is active.
 *
 * THE BUG THIS FIXES: the Supabase access token (JWT) has a hard ~3-hour
 * lifetime (set on the Supabase project). Nothing in the app refreshed it —
 * the middleware deliberately avoids refresh (cookie-desync risk), there was no
 * live browser client running, and the server-side getUser() can't persist a
 * refreshed token from a Server Component. So the refresh token sitting in the
 * cookie was never exchanged, and the session died exactly at the token's
 * expiry even while the user was actively using the app. The next /api/* call
 * then 401'd and IdleLogoutGuard's fetch interceptor logged them out.
 *
 * @supabase/ssr's browser client reads the same `sb-<ref>-auth-token` cookies
 * the server reads, and (with autoRefreshToken on by default) rotates the
 * access token + rewrites those cookies BEFORE it expires. Mounting it here
 * gives us that refresh loop, so an active session survives past the token's
 * hard expiry. Genuine inactivity is still handled by IdleLogoutGuard.
 */
export default function SessionKeepAlive() {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return;

    const supabase = createBrowserClient(url, anonKey);

    // getSession() loads the session from the cookies and kicks off the
    // auto-refresh ticker; startAutoRefresh() is belt-and-suspenders in case
    // the page isn't focused when this mounts.
    void supabase.auth.getSession();
    try {
      void supabase.auth.startAutoRefresh();
    } catch {}

    return () => {
      try {
        void supabase.auth.stopAutoRefresh();
      } catch {}
    };
  }, []);

  return null;
}
