"use client";

import { useState, useEffect, useMemo } from "react";
import { KeyRound, Eye, EyeOff, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [countdown, setCountdown] = useState(3);

  const [sessionLoading, setSessionLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Password validation rules
  const validations = useMemo(() => ({
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  }), [password]);

  const allValid = validations.minLength && validations.hasUppercase && validations.hasNumber && validations.hasSpecial;

  const goToPortal = () => {
    router.push("/login");
    router.refresh();
  };

  useEffect(() => {
    if (!success) return;
    if (countdown <= 0) {
      goToPortal();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [success, countdown]);

  useEffect(() => {
    let mounted = true;

    const checkInitialSession = async () => {
      try {
        // Handle PKCE code from password reset email link
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error("[SetPassword] Code exchange failed:", exchangeError.message);
          }
          // Clean the URL
          window.history.replaceState(null, "", window.location.pathname);
        }

        // Also handle hash fragment tokens (invite flow)
        const hash = window.location.hash;
        if (hash && hash.includes("access_token")) {
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            window.history.replaceState(null, "", window.location.pathname);
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (mounted) {
          setHasSession(!!session);
          setSessionLoading(false);
          if (session?.user) {
            const meta = (session.user.user_metadata ?? {}) as Record<string, any>;
            const name =
              meta.first_name ||
              meta.firstName ||
              (meta.full_name ? String(meta.full_name).split(" ")[0] : "") ||
              (session.user.email ? session.user.email.split("@")[0] : "");
            setFirstName(name || "");
          }
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
        if (session?.user && !firstName) {
          const meta = (session.user.user_metadata ?? {}) as Record<string, any>;
          const name =
            meta.first_name ||
            meta.firstName ||
            (meta.full_name ? String(meta.full_name).split(" ")[0] : "") ||
            (session.user.email ? session.user.email.split("@")[0] : "");
          setFirstName(name || "");
        }
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

    if (!allValid) {
      setError("Please meet all password requirements");
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

      setSuccess(true);
      // Sign out so user logs in with new password; countdown handles redirect
      await supabase.auth.signOut();
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

  if (success) {
    const displayName = firstName
      ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
      : "";
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-10">
        <div className="w-full max-w-[460px] rounded-3xl border border-gray-100 bg-white px-8 py-10 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#e8efd8]">
              <Check size={40} className="text-[#2f6b14]" strokeWidth={3} />
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#5a8a32]">
              Account Activated
            </p>
            <h1 className="mb-4 text-2xl font-bold tracking-tight text-gray-900">
              {displayName ? `You're all set, ${displayName}!` : "You're all set!"}
            </h1>
            <p className="mb-8 text-[15px] leading-relaxed text-gray-500">
              Your password has been saved and your iClosed
              <br />
              account is ready to use.
            </p>

            <div className="mb-8 w-full rounded-2xl border border-gray-100 bg-gray-50 px-6 py-5 text-left">
              <ul className="space-y-3 text-[15px] text-gray-700">
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#7fb04a]" />
                  Password saved securely
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#7fb04a]" />
                  Account verified
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#7fb04a]" />
                  Portal access granted
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={goToPortal}
              className="mb-3 w-full cursor-pointer rounded-xl bg-[#c0392b] px-5 py-3.5 text-[15px] font-semibold text-white shadow-md shadow-[#c0392b]/20 transition-all hover:bg-[#a93226]"
            >
              Go to my portal
            </button>
            <p className="mb-6 text-sm text-gray-500">
              Redirecting automatically in{" "}
              <span className="font-semibold text-gray-700">
                {Math.max(countdown, 0)}s
              </span>
            </p>

            <div className="w-full border-t border-gray-100 pt-5">
              <div className="flex items-center justify-center text-lg font-semibold tracking-tight">
                <span className="text-[#c0392b]">i</span>
                <span className="text-gray-900">Closed</span>
              </div>
            </div>
          </div>
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
        <div className="relative z-10">
          <img src="/logo.png" alt="iClosed" className="h-8 brightness-0 invert" />
        </div>

        <div className="relative z-10">
          <h2 className="mb-4 text-3xl font-bold leading-tight tracking-tight" style={{ color: "#f7f2f2" }}>
            Welcome to your Closing Portal
          </h2>
          <p className="text-[0.95rem] leading-relaxed text-white/50 max-w-[85%]">
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
          <div className="mb-8 md:hidden">
            <img src="/logo.png" alt="iClosed" className="h-8" />
          </div>

          <div className="mb-8 p-6 bg-white border border-gray-100 rounded-2xl shadow-sm">
            {/* Header with key icon */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-100 bg-red-50">
                <KeyRound size={24} className="text-[#c0392b]" />
              </div>
              <h1 className="mb-1.5 text-2xl font-bold text-gray-900 tracking-tight">
                Set your new password
              </h1>
              <p className="text-sm text-gray-500 leading-relaxed">
                To keep your account secure, create a strong, unique password below.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {/* New Password field */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="password"
                    className="text-sm font-semibold text-gray-800"
                  >
                    New Password
                  </label>
                  <div className="relative flex items-center">
                    <KeyRound
                      size={16}
                      className="pointer-events-none absolute left-3.5 text-gray-400"
                    />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter a password with at least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-3 pl-10 pr-11 text-sm text-gray-900 outline-none placeholder:text-gray-400 transition-all focus:border-[#c0392b] focus:bg-white focus:ring-2 focus:ring-[#c0392b]/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
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
                    <KeyRound
                      size={16}
                      className="pointer-events-none absolute left-3.5 text-gray-400"
                    />
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Re-enter the same password to confirm"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-3 pl-10 pr-11 text-sm text-gray-900 outline-none placeholder:text-gray-400 transition-all focus:border-[#c0392b] focus:bg-white focus:ring-2 focus:ring-[#c0392b]/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3.5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Password validation rules */}
                <div className="text-sm text-gray-500 space-y-1">
                  <p className="font-medium text-gray-700">Use at least 8 characters, with a mix of:</p>
                  <ul className="space-y-0.5 ml-1">
                    <li className={`flex items-center gap-1.5 ${validations.hasUppercase ? "text-green-600" : "text-gray-400"}`}>
                      <span className="text-xs">{validations.hasUppercase ? "✓" : "•"}</span> One uppercase letter
                    </li>
                    <li className={`flex items-center gap-1.5 ${validations.hasNumber ? "text-green-600" : "text-gray-400"}`}>
                      <span className="text-xs">{validations.hasNumber ? "✓" : "•"}</span> One number
                    </li>
                    <li className={`flex items-center gap-1.5 ${validations.hasSpecial ? "text-green-600" : "text-gray-400"}`}>
                      <span className="text-xs">{validations.hasSpecial ? "✓" : "•"}</span> One special character (like !, @, #)
                    </li>
                  </ul>
                </div>

                {error && (
                  <p className="text-sm text-red-600 font-medium leading-tight">
                    {error}
                  </p>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading || !allValid || password !== confirmPassword}
                  className="cursor-pointer group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#c0392b] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-[#c0392b]/20 transition-all hover:enabled:bg-[#a93226] hover:enabled:-translate-y-px disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                  ) : (
                    "Confirm"
                  )}
                </button>
              </form>
          </div>
        </div>
      </main>
    </div>
  );
}
