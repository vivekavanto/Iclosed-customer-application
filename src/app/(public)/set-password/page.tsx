"use client";

import { useState, useEffect } from "react";
import { Lock, ArrowRight, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [sessionLoading, setSessionLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    let mounted = true;

    const checkInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (mounted) {
          setHasSession(!!session);
          setSessionLoading(false);
        }
      } catch (err) {
        if (mounted) setSessionLoading(false);
      }
    };

    checkInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setHasSession(!!session);
        setSessionLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Double check session immediately before update
    let currentSession = hasSession;
    if (!currentSession) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      currentSession = !!session;
      setHasSession(currentSession);
    }

    if (!currentSession) {
      setError(
        "Session expired or missing. Please click the link in your email again to refresh your access.",
      );
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      // Trigger welcome email on first login (fire and forget)
      fetch("/api/auth/welcome-email", { method: "POST" }).catch(() => {});

      setSuccess(true);
      // Check retainer status before redirecting
      let redirectTo = "/retainer";
      try {
        const retainerRes = await fetch("/api/retainer/check");
        const retainerData = await retainerRes.json();
        if (retainerData.signed) redirectTo = "/dashboard";
      } catch {}
      setTimeout(() => {
        router.push(redirectTo);
        router.refresh();
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to set password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-100 border-t-[#c0392b]" />
          <p className="text-sm font-medium text-gray-500">
            Checking authorization...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* ── Left branding panel ── */}
      <aside
        className="relative hidden md:flex w-[420px] flex-shrink-0 flex-col justify-between overflow-hidden px-8 py-10"
        style={{
          background:
            "linear-gradient(145deg, #c0392b 0%, #8b1a12 60%, #5a0d09 100%)",
        }}
      >
        <div className="relative z-10 flex items-baseline gap-0.5">
          <span className="font-serif text-[2.4rem] font-extrabold italic leading-none text-white drop-shadow-md">
            i
          </span>
          <span className="text-[2rem] font-extrabold leading-none tracking-tight text-white/95">
            Closed
          </span>
        </div>

        <div className="relative z-10">
          <h2 className="mb-4 text-3xl font-bold leading-tight text-white tracking-tight">
            Welcome to your Closing Portal
          </h2>
          <p className="text-[0.95rem] leading-relaxed text-white/80 max-w-[85%]">
            Set your password to gain access to your secure portal, track
            milestones, and easily manage your closing documents online.
          </p>
        </div>

        <p className="relative z-10 text-[0.72rem] text-white/45">
          © {new Date().getFullYear()} iClosed · All rights reserved
        </p>
      </aside>

      {/* ── Right form panel ── */}
      <main className="flex flex-1 items-start justify-center px-6 pt-12 md:items-center md:pt-8 bg-gray-50/30">
        <div className="w-full max-w-[400px]">
          {/* Mobile-only logo */}
          <div className="mb-8 flex items-baseline gap-0.5 md:hidden">
            <span className="font-serif text-[2rem] font-extrabold italic leading-none text-[#c0392b]">
              i
            </span>
            <span className="text-[1.6rem] font-extrabold leading-none tracking-tight text-gray-900">
              Closed
            </span>
          </div>

          <div className="mb-8 p-6 bg-white border border-gray-100 rounded-2xl shadow-sm">
            <h1 className="mb-1.5 text-2xl font-bold text-gray-900 tracking-tight">
              {success ? "Success!" : "Create a Password"}
            </h1>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              {success
                ? "Your password has been set successfully."
                : "Please choose a secure password to protect your real estate transaction details."}
            </p>

            {success ? (
              <div className="flex flex-col items-center justify-center py-6">
                <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-4">
                  <CheckCircle2
                    size={28}
                    className="text-green-500"
                    strokeWidth={2.5}
                  />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  Password Saved!
                </h3>
                <p className="text-sm text-gray-500">
                  Redirecting you to your dashboard...
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {/* Password field */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="password"
                    className="text-sm font-semibold text-gray-800"
                  >
                    New Password
                  </label>
                  <div className="relative flex items-center">
                    <Lock
                      size={16}
                      className="pointer-events-none absolute left-3.5 text-gray-400"
                    />
                    <input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none placeholder:text-gray-400 transition-all focus:border-[#c0392b] focus:bg-white focus:ring-2 focus:ring-[#c0392b]/10"
                    />
                  </div>
                </div>

                {/* Confirm Password field */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="confirmPassword"
                    className="text-sm font-semibold text-gray-800"
                  >
                    Confirm Password
                  </label>
                  <div className="relative flex items-center">
                    <Lock
                      size={16}
                      className="pointer-events-none absolute left-3.5 text-gray-400"
                    />
                    <input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none placeholder:text-gray-400 transition-all focus:border-[#c0392b] focus:bg-white focus:ring-2 focus:ring-[#c0392b]/10"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 font-medium leading-tight">
                    {error}
                  </p>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#c0392b] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-[#c0392b]/20 transition-all hover:enabled:bg-[#a93226] hover:enabled:-translate-y-px disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                  ) : (
                    <>
                      Save and Continue
                      <ArrowRight
                        size={16}
                        className="transition-transform duration-150 group-hover:translate-x-1"
                      />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
