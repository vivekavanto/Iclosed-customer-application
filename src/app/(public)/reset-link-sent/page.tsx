"use client";

import { CheckCircle2, ArrowRight } from "lucide-react";

export default function ResetLinkSentPage() {
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
            Check your inbox
          </h2>

          <p className="mb-10 text-sm leading-relaxed text-white/75">
            We&apos;ve sent you a password reset link. Click the link in the
            email to set a new password for your account.
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

          {/* Success card */}
          <div className="flex flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2
                size={32}
                className="text-green-500"
                strokeWidth={2.5}
              />
            </div>

            <h1 className="mb-2 text-[1.6rem] font-bold text-gray-900">
              Password Reset Link Sent
            </h1>

            <p className="mb-8 text-sm leading-relaxed text-gray-500 max-w-[340px]">
              If an account with that email exists, a password reset link has
              been sent. Please check your inbox and click the link to reset
              your password.
            </p>

            {/* Sign In button */}
            <button
              type="button"
              onClick={() => window.location.href = "/login"}
              className="group flex w-full items-center justify-center gap-2 rounded-lg bg-[#c0392b] px-5 py-[0.78rem] text-[0.9rem] font-semibold tracking-[0.01em] text-white shadow-[0_4px_14px_rgba(192,57,43,0.35)] transition-all duration-200 hover:bg-[#a93226] hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(192,57,43,0.4)]"
            >
              Sign In
              <ArrowRight
                size={16}
                className="transition-transform duration-150 group-hover:translate-x-1"
              />
            </button>

            {/* Google SSO - hidden until configured
            <div className="mt-4 flex w-full items-center gap-3 text-[0.78rem] text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              or
              <span className="h-px flex-1 bg-gray-200" />
            </div>
            <button
              type="button"
              className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-gray-300 bg-white px-5 py-[0.72rem] text-[0.88rem] font-medium text-gray-800 transition-all duration-150 hover:border-[#c0392b]/40 hover:bg-gray-50 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
            >
              Sign in with Google
            </button>
            */}
          </div>
        </div>
      </main>
    </div>
  );
}
