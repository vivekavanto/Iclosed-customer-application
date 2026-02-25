"use client";

import { useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  BarChart2,
  Users,
  ClipboardList,
} from "lucide-react";

export default function LenderLoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  const features = [
    { icon: <BarChart2 size={16} className="flex-shrink-0 opacity-85" />, label: "Real-time deal tracking" },
    { icon: <Users size={16} className="flex-shrink-0 opacity-85" />, label: "Borrower management hub" },
    { icon: <ClipboardList size={16} className="flex-shrink-0 opacity-85" />, label: "Document review & approvals" },
  ];

  return (
    <div className="flex min-h-screen bg-white">

      {/* ── Left branding panel ── */}
      <aside
        className="relative hidden md:flex w-[420px] flex-shrink-0 flex-col justify-between overflow-hidden px-8 py-10"
        style={{ background: "linear-gradient(145deg, #1a2744 0%, #0f1a33 55%, #080f1f 100%)" }}
      >
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-[90px] -right-[110px] h-[340px] w-[340px] rounded-full bg-[#c0392b] opacity-[0.03]" />
        <div className="pointer-events-none absolute -bottom-[70px] -left-[90px] h-[260px] w-[260px] rounded-full bg-[#4a7fd4] opacity-[0.03]" />

        {/* Content */}
        <div className="relative z-10 mt-4">
          {/* Logo */}
          <div className="mb-6 flex items-baseline gap-0.5">
            <span
              className="font-serif text-[2rem] font-extrabold italic leading-none"
              style={{ color: "#c0392b" }}
            >
              i
            </span>
            <span
              className="text-[1.6rem] font-extrabold leading-none tracking-tight"
              style={{ color: "#ffffff" }}
            >
              Closed
            </span>
          </div>

          {/* Lender badge */}
          <div
            className="mb-6 inline-block rounded-full border px-3 py-1 text-[0.72rem] font-bold uppercase tracking-[0.08em]"
            style={{
              color: "#e87c73",
              borderColor: "rgba(192,57,43,0.3)",
              backgroundColor: "rgba(192,57,43,0.15)",
            }}
          >
            Lender Portal
          </div>

          <h2
            className="mb-4 text-[1.75rem] font-bold leading-snug"
            style={{ color: "#ffffff" }}
          >
            Your lending dashboard,
            <br />
            all in one place.
          </h2>

          <p
            className="mb-10 text-sm leading-relaxed"
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            Manage borrower transactions, review closing documents, and track
            deal progress across your entire portfolio.
          </p>

          {/* Feature pills */}
          <ul className="flex flex-col gap-3.5">
            {features.map(({ icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-[0.85rem] backdrop-blur-md"
                style={{
                  color: "rgba(255,255,255,0.82)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                {icon}
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p
          className="relative z-10 text-[0.72rem]"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          © {new Date().getFullYear()} iClosed · All rights reserved
        </p>
      </aside>

      {/* ── Right form panel ── */}
      <main className="flex flex-1 items-start justify-center px-6 pt-12 md:items-center md:pt-8">
        <div className="w-full max-w-[400px]">

          {/* Mobile-only logo */}
          <div className="mb-8 flex items-baseline gap-0.5 md:hidden">
            <span className="font-serif text-[2rem] font-extrabold italic leading-none text-[#c0392b]">i</span>
            <span className="text-[1.6rem] font-extrabold leading-none tracking-tight text-gray-900">Closed</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <div className="mb-3 inline-block rounded-full border border-[#1a2744]/20 bg-[#1a2744]/[0.08] px-3 py-1 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[#1a2744]">
              Lender Portal
            </div>
            <h1 className="mb-1.5 text-[1.6rem] font-bold text-gray-900">Sign in to your account</h1>
            <p className="text-sm text-gray-500">Manage your lending operations</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>

            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lender-email" className="text-[0.8rem] font-semibold tracking-[0.01em] text-gray-800">
                Lender Email
              </label>
              <div className="relative flex items-center">
                <Mail size={16} className="pointer-events-none absolute left-3.5 text-gray-400" />
                <input
                  id="lender-email"
                  type="email"
                  autoComplete="email"
                  placeholder="lender@firm.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border-[1.5px] border-gray-200 bg-gray-50 py-[0.7rem] pl-10 pr-4 text-sm text-gray-900 outline-none placeholder:text-gray-400 transition-all duration-200 focus:border-[#1a2744] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,39,68,0.1)]"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="lender-password" className="text-[0.8rem] font-semibold tracking-[0.01em] text-gray-800">
                  Password
                </label>
                <a
                  href="/forgot-password"
                  className="text-[0.78rem] text-[#1a2744] no-underline transition-opacity duration-150 hover:opacity-70"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative flex items-center">
                <Lock size={16} className="pointer-events-none absolute left-3.5 text-gray-400" />
                <input
                  id="lender-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border-[1.5px] border-gray-200 bg-gray-50 py-[0.7rem] pl-10 pr-10 text-sm text-gray-900 outline-none placeholder:text-gray-400 transition-all duration-200 focus:border-[#1a2744] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,39,68,0.1)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 flex items-center rounded p-1 text-gray-400 transition-colors duration-150 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="group mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1a2744] px-5 py-[0.78rem] text-[0.9rem] font-semibold tracking-[0.01em] text-white shadow-[0_4px_14px_rgba(26,39,68,0.3)] transition-all duration-200 hover:enabled:bg-[#0f1a33] hover:enabled:-translate-y-px hover:enabled:shadow-[0_6px_18px_rgba(26,39,68,0.38)] active:enabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/35 border-t-white" />
              ) : (
                <>
                  Sign In as Lender
                  <ArrowRight size={16} className="transition-transform duration-150 group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          {/* Customer portal link */}
          <p className="mt-8 text-center text-[0.8rem] text-gray-500">
            Are you a borrower?{" "}
            <a
              href="/login"
              className="font-medium text-[#1a2744] no-underline transition-opacity duration-150 hover:opacity-70"
            >
              Sign in to Customer Portal →
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}