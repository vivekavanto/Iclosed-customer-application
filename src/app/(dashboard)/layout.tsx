"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

const navLinks = [
  { label: "Home", href: "/dashboard" },
  { label: "Documents", href: "/documents" },
  { label: "Details", href: "/details" },
  { label: "Retainer", href: "/retainer" },
];

function IClosedLogo() {
  return (
    <Link href="/dashboard" className="flex items-center select-none">
      <span
        className="text-[var(--color-primary)] font-bold italic text-xl leading-none"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        i
      </span>
      <span className="text-[var(--color-text-heading)] font-bold text-xl leading-none tracking-tight">
        Closed
      </span>
    </Link>
  );
}

function ProfileDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-heading)] hover:text-[var(--color-text-heading)] transition-colors cursor-pointer focus:outline-none"
      >
        <span>User</span>
        {/* Chevron */}
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <p className="text-xs text-[var(--color-text-muted)]">
              Signed in as
            </p>
            <p className="text-sm font-semibold text-[var(--color-text-heading)] truncate">
              User
            </p>
          </div>

          <div className="py-1">
            <button
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--color-text-body)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)] transition-colors cursor-pointer text-left group"
              onClick={() => {
                setOpen(false);
                // logout logic goes here
              }}
            >
              {/* Logout icon */}
              <svg
                className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"
                />
              </svg>
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
      {/* ── Top Navigation Bar ── */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="w-full px-8 h-14 flex items-center gap-8">
          {/* Logo */}
          <IClosedLogo />

          {/* Nav links */}
          <nav className="flex items-center gap-1 flex-1">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={[
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    "text-black hover:text-black",
                    "no-underline decoration-transparent",
                    active ? "bg-gray-100" : "hover:bg-gray-100",
                  ].join(" ")}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Profile / Logout */}
          <ProfileDropdown />
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 px-4 py-8 w-full">{children}</main>
    </div>
  );
}
