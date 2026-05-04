"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, User } from "lucide-react";

export interface ProfileUser {
  first_name?: string;
  last_name?: string;
}

export default function ProfileDropdown({ user }: { user: ProfileUser | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const displayName =
    `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "User";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-heading)] transition-colors cursor-pointer focus:outline-none"
      >
        <div className="w-7 h-7 rounded-full bg-[#C10007] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initial}
        </div>
        <span className="hidden sm:block truncate max-w-[120px]">{displayName}</span>
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
            <p className="text-sm font-semibold text-[var(--color-text-heading)] truncate">
              {displayName}
            </p>
          </div>
          <div className="py-1">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--color-text-body)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)] transition-colors cursor-pointer text-left group"
            >
              <User
                size={15}
                className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors"
                strokeWidth={2}
              />
              Profile
            </Link>
            <button
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--color-text-body)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)] transition-colors cursor-pointer text-left group"
              onClick={handleLogout}
            >
              <LogOut
                size={15}
                className="text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors"
                strokeWidth={2}
              />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
