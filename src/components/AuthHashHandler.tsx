"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

/**
 * This component runs on every page load and checks if the URL
 * contains a Supabase hash fragment (#access_token=...).
 *
 * Supabase invite/magic links redirect to the site with tokens in the hash.
 * Since hash fragments are invisible to server-side code, we must handle
 * them client-side.
 *
 * Flow:
 * 1. Detect hash fragment with access_token
 * 2. Let Supabase client auto-detect and set the session
 * 3. Redirect to /set-password (for invite type) or /dashboard (for others)
 */
export default function AuthHashHandler() {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    // Only run in the browser
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return;

    // Parse the hash fragment
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type"); // "invite", "recovery", "signup", etc.

    if (!accessToken || !refreshToken) return;

    setProcessing(true);

    async function handleHashAuth() {
      try {
        console.log("[AuthHashHandler] Detected hash auth tokens, type:", type);

        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );

        // Set the session using the tokens from the hash
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken!,
          refresh_token: refreshToken!,
        });

        if (error) {
          console.error("[AuthHashHandler] Failed to set session:", error.message);
          // Clear the hash and redirect to login
          window.location.replace("/login?error=" + encodeURIComponent(error.message));
          return;
        }

        console.log("[AuthHashHandler] Session set successfully for:", data.user?.email);

        // Clear the hash from the URL
        window.history.replaceState(null, "", window.location.pathname);

        // Redirect based on the type
        if (type === "invite" || type === "recovery") {
          // New user invite or password recovery → go to set-password page
          console.log("[AuthHashHandler] Redirecting to /set-password");
          window.location.href = "/set-password";
        } else {
          // Regular login → check retainer before going to dashboard
          try {
            const retainerRes = await fetch("/api/retainer/check");
            const retainerData = await retainerRes.json();
            const dest = retainerData.signed ? "/dashboard" : "/retainer";
            console.log("[AuthHashHandler] Redirecting to", dest);
            window.location.href = dest;
          } catch {
            console.log("[AuthHashHandler] Retainer check failed, defaulting to /retainer");
            window.location.href = "/retainer";
          }
        }
      } catch (err) {
        console.error("[AuthHashHandler] Unexpected error:", err);
        window.location.replace("/login?error=Authentication+failed");
      } finally {
        // Just as a fallback to clear the loading state if somehow stuck
        setTimeout(() => setProcessing(false), 2000);
      }
    }

    handleHashAuth();
  }, [router]);

  if (!processing) return null;

  // Show a loading spinner while processing the auth tokens
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid #e5e7eb",
            borderTopColor: "#c0392b",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }}
        />
        <p style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>
          Verifying your invitation...
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
