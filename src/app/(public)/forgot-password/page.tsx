"use client";

import { useState, useEffect } from "react";
import { Mail, ArrowRight, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Show error from expired/invalid reset links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorMsg = params.get("error");
    if (errorMsg) {
      setError(errorMsg);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        "https://iclosed-admin-panel.vercel.app/api/admin/reset-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || "Something went wrong. Please try again.",
        );
      }

      // Always redirect to success page (don't reveal if email exists or not)
      router.push("/reset-link-sent");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
        <div className="pointer-events-none absolute -top-20 -right-24 h-80 w-80 rounded-full bg-white opacity-[0.12]" />
        <div className="pointer-events-none absolute -bottom-16 -left-20 h-60 w-60 rounded-full bg-white opacity-[0.12]" />

        <div className="relative z-10 mt-4">
          <div className="mb-12">
            <img src="/logo.png" alt="iClosed" className="h-8 brightness-0 invert" />
          </div>

          <h2 className="mb-4 text-[1.75rem] font-bold leading-snug text-white">
            Reset your password
          </h2>

          <p className="mb-10 text-sm leading-relaxed text-white/75">
            No worries — it happens to the best of us. Enter your email and
            we&apos;ll send you a secure link to reset your password.
          </p>
        </div>

        <p className="relative z-10 text-[0.72rem] text-white/45">
          © {new Date().getFullYear()} iClosed · All rights reserved
        </p>
      </aside>

      {/* ── Right form panel ── */}
      <main className="flex flex-1 items-start justify-center px-6 pt-12 md:items-center md:pt-8">
        <div className="w-full max-w-[400px]">
          {/* Mobile-only logo */}
          <div className="mb-8 md:hidden">
            <img src="/logo.png" alt="iClosed" className="h-8" />
          </div>

          {/* Header */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-100 bg-red-50">
              <KeyRound size={24} className="text-[#c0392b]" />
            </div>
            <h1 className="mb-1.5 text-[1.6rem] font-bold text-gray-900">
              Forgot Password
            </h1>
            <p className="text-sm text-gray-500">
              A password reset link is sent to the user&apos;s email.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-[0.8rem] font-semibold tracking-[0.01em] text-gray-800"
              >
                Email
              </label>
              <div className="relative flex items-center">
                <Mail
                  size={16}
                  className="pointer-events-none absolute left-3.5 text-gray-400"
                />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="johndoe@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border-[1.5px] border-gray-200 bg-gray-50 py-[0.7rem] pl-10 pr-4 text-sm text-gray-900 outline-none placeholder:text-gray-400 transition-all duration-200 focus:border-[#c0392b] focus:bg-white focus:shadow-[0_0_0_3px_rgba(192,57,43,0.12)]"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="cursor-pointer group mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-[#c0392b] px-5 py-[0.78rem] text-[0.9rem] font-semibold tracking-[0.01em] text-white shadow-[0_4px_14px_rgba(192,57,43,0.35)] transition-all duration-200 hover:enabled:bg-[#a93226] hover:enabled:-translate-y-px hover:enabled:shadow-[0_6px_18px_rgba(192,57,43,0.4)] active:enabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/35 border-t-white" />
              ) : (
                <>
                  Send Reset Link
                  <ArrowRight
                    size={16}
                    className="transition-transform duration-150 group-hover:translate-x-1"
                  />
                </>
              )}
            </button>

            {/* Google SSO - hidden until configured
            <div className="flex items-center gap-3 text-[0.78rem] text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              or
              <span className="h-px flex-1 bg-gray-200" />
            </div>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-gray-300 bg-white px-5 py-[0.72rem] text-[0.88rem] font-medium text-gray-800 transition-all duration-150 hover:border-[#c0392b]/40 hover:bg-gray-50 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
            >
              Sign in with Google
            </button>
            */}
          </form>

          {/* Back to login */}
          <p className="mt-8 text-center text-[0.8rem] text-gray-500">
            Remember your password?{" "}
            <a
              href="/login"
              className="font-medium text-[#c0392b] no-underline transition-colors duration-150 hover:text-[#a93226] cursor-pointer"
            >
              Back to Sign In
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
