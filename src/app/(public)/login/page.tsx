"use client";

import { useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Building2,
  Shield,
  FileCheck,
} from "lucide-react";

import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    setLoading(true);
    setError("");

    const validEmail = "admin@gmail.com";
    const validPassword = "123456";

    setTimeout(() => {
      if (email === validEmail && password === validPassword) {
        router.push("/dashboard");
      } else {
        setError("Invalid email or password");
        setLoading(false);
      }
    }, 500);

    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  const features = [
    {
      icon: <Shield size={16} className="flex-shrink-0 opacity-90" />,
      label: "Bank-grade encryption",
    },
    {
      icon: <FileCheck size={16} className="flex-shrink-0 opacity-90" />,
      label: "e-Signature ready documents",
    },
    {
      icon: <Building2 size={16} className="flex-shrink-0 opacity-90" />,
      label: "Expert legal team on standby",
    },
  ];

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
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-20 -right-24 h-80 w-80 rounded-full bg-white opacity-[0.12]" />
        <div className="pointer-events-none absolute -bottom-16 -left-20 h-60 w-60 rounded-full bg-white opacity-[0.12]" />

        {/* Content */}
        <div className="relative z-10 mt-4">
          {/* Logo */}
          <div className="mb-12 flex items-baseline gap-0.5">
            <span className="font-serif text-[2rem] font-extrabold italic leading-none text-white">
              i
            </span>
            <span className="text-[1.6rem] font-extrabold leading-none tracking-tight text-white">
              Closed
            </span>
          </div>

          <h2 className="mb-4 text-[1.75rem] font-bold leading-snug text-white">
            Real Estate Closings,
            <br />
            made simple.
          </h2>

          <p className="mb-10 text-sm leading-relaxed text-white/75">
            Your secure portal for managing documents, legal support, and every
            step of your transaction — all in one place.
          </p>

          {/* Feature pills */}
          <ul className="flex flex-col gap-3.5">
            {features.map(({ icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2.5 rounded-xl border border-white/[0.15] bg-white/10 px-3.5 py-2 text-[0.85rem] text-white/[0.88] backdrop-blur-md"
              >
                {icon}
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-[0.72rem] text-white/45">
          © {new Date().getFullYear()} iClosed · All rights reserved
        </p>
      </aside>

      {/* ── Right form panel ── */}
      <main className="flex flex-1 items-start justify-center px-6 pt-12 md:items-center md:pt-8">
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

          {/* Header */}
          <div className="mb-8">
            <h1 className="mb-1.5 text-[1.6rem] font-bold text-gray-900">
              Welcome back
            </h1>
            <p className="text-sm text-gray-500">
              Sign in to your customer portal
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
                Email address
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
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border-[1.5px] border-gray-200 bg-gray-50 py-[0.7rem] pl-10 pr-4 text-sm text-gray-900 outline-none placeholder:text-gray-400 transition-all duration-200 focus:border-[#c0392b] focus:bg-white focus:shadow-[0_0_0_3px_rgba(192,57,43,0.12)]"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-[0.8rem] font-semibold tracking-[0.01em] text-gray-800"
                >
                  Password
                </label>
                <a
                  href="/forgot-password"
                  className="text-[0.78rem] text-[#c0392b] no-underline transition-colors duration-150 hover:text-[#a93226]"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative flex items-center">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3.5 text-gray-400"
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border-[1.5px] border-gray-200 bg-gray-50 py-[0.7rem] pl-10 pr-10 text-sm text-gray-900 outline-none placeholder:text-gray-400 transition-all duration-200 focus:border-[#c0392b] focus:bg-white focus:shadow-[0_0_0_3px_rgba(192,57,43,0.12)]"
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

            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="group mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-[#c0392b] px-5 py-[0.78rem] text-[0.9rem] font-semibold tracking-[0.01em] text-white shadow-[0_4px_14px_rgba(192,57,43,0.35)] transition-all duration-200 hover:enabled:bg-[#a93226] hover:enabled:-translate-y-px hover:enabled:shadow-[0_6px_18px_rgba(192,57,43,0.4)] active:enabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/35 border-t-white" />
              ) : (
                <>
                  Sign In
                  <ArrowRight
                    size={16}
                    className="transition-transform duration-150 group-hover:translate-x-1"
                  />
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 text-[0.78rem] text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              or
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            {/* Google SSO */}
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-gray-300 bg-white px-5 py-[0.72rem] text-[0.88rem] font-medium text-gray-800 transition-all duration-150 hover:border-[#c0392b]/40 hover:bg-gray-50 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                aria-hidden="true"
              >
                <path
                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                  fill="#4285F4"
                />
                <path
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                  fill="#34A853"
                />
                <path
                  d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                  fill="#FBBC05"
                />
                <path
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </button>
          </form>

          {/* Lender portal link */}
          <p className="mt-8 text-center text-[0.8rem] text-gray-500">
            Are you a lender?{" "}
            <a
              href="/lender/login"
              className="font-medium text-[#c0392b] no-underline transition-colors duration-150 hover:text-[#a93226]"
            >
              Sign in to Lender Portal →
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
