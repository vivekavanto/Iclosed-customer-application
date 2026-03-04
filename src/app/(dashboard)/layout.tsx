"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Menu, X, LogOut, ChevronDown, LayoutDashboard, FileText, Info, BookOpen } from "lucide-react";
import Footer from "@/components/layout/Footer";

const navLinks = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Details",   href: "/details",   icon: Info },
  { label: "Blog",      href: "/blog",       icon: BookOpen },
];

/* ════════════════════════════════════════════
   LOGO
════════════════════════════════════════════ */

function IClosedLogo() {
  return (
    <Link href="/" className="flex items-center select-none flex-shrink-0">
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

/* ════════════════════════════════════════════
   PROFILE DROPDOWN  (desktop)
════════════════════════════════════════════ */

function ProfileDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-heading)] transition-colors cursor-pointer focus:outline-none"
      >
        {/* Avatar circle */}
        <div className="w-7 h-7 rounded-full bg-[#C10007] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          U
        </div>
        <span className="hidden sm:block">User</span>
        <ChevronDown
          size={14}
          className={`hidden sm:block transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          strokeWidth={2.5}
        />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <p className="text-xs text-[var(--color-text-muted)]">Signed in as</p>
            <p className="text-sm font-semibold text-[var(--color-text-heading)] truncate">User</p>
          </div>
          <div className="py-1">
            <button
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--color-text-body)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)] transition-colors cursor-pointer text-left group"
              onClick={() => setOpen(false)}
            >
              <LogOut size={15} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors" strokeWidth={2} />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   LAYOUT
════════════════════════════════════════════ */

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">

      {/* ── Top Navigation Bar ── */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-4">

          {/* Logo */}
          <IClosedLogo />

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={[
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  ].join(" ")}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Spacer on mobile */}
          <div className="flex-1 md:hidden" />

          {/* Profile (desktop) */}
          <div className="hidden md:block">
            <ProfileDropdown />
          </div>

          {/* Avatar only on mobile (no dropdown, hamburger handles it) */}
          <div className="flex items-center gap-2 md:hidden">
            <div className="w-7 h-7 rounded-full bg-[#C10007] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              U
            </div>
          </div>

          {/* Hamburger button */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Toggle menu"
          >
            {mobileOpen
              ? <X size={20} className="text-gray-700" strokeWidth={2} />
              : <Menu size={20} className="text-gray-700" strokeWidth={2} />}
          </button>
        </div>

        {/* ── Mobile Menu Drawer ── */}
        {mobileOpen && (
          <div className="md:hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={[
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    active
                      ? "bg-[#FEF2F2] text-[#C10007]"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  ].join(" ")}
                >
                  <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                  {link.label}
                </Link>
              );
            })}

            {/* Divider + logout */}
            <div className="pt-2 mt-2 border-t border-gray-100">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                <div className="w-7 h-7 rounded-full bg-[#C10007] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  U
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400">Signed in as</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">User</p>
                </div>
                <button className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#C10007] transition-colors cursor-pointer">
                  <LogOut size={14} strokeWidth={2} />
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── Page content ── */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
          {children}
        </div>
      </main>

      <Footer />

      {/* ── Mobile Bottom Navigation Bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex items-center justify-around h-16 px-2 safe-area-pb">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors"
            >
              <div className={`w-10 h-7 flex items-center justify-center rounded-full transition-all duration-200 ${active ? "bg-[#FEF2F2]" : ""}`}>
                <Icon
                  size={20}
                  strokeWidth={active ? 2.2 : 1.8}
                  className={active ? "text-[#C10007]" : "text-gray-400"}
                />
              </div>
              <span className={`text-[10px] font-semibold transition-colors ${active ? "text-[#C10007]" : "text-gray-400"}`}>
                {link.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom padding so content isn't hidden behind the bottom nav on mobile */}
      <div className="md:hidden h-16" />

    </div>
  );
}
