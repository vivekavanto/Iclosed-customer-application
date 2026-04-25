"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ProfileDropdown, { ProfileUser } from "./ProfileDropdown";

export default function HomeHeaderAuth() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.user) setUser(d.user);
      })
      .catch(() => {})
      .finally(() => setResolved(true));
  }, []);

  if (resolved && user) {
    return (
      <>
        <Link
          href="/dashboard"
          className="px-3 sm:px-4 py-2 text-sm font-semibold text-[#C10007] border border-[#C10007]/30 rounded-sm hover:bg-[#C10007] hover:!text-white transition-colors"
        >
          Dashboard
        </Link>
        <ProfileDropdown user={user} />
      </>
    );
  }

  return (
    <Link
      href="/login"
      className="px-3 sm:px-4 py-2 text-sm font-medium text-gray-600 rounded-sm hover:bg-[#C10007] hover:!text-white transition-colors"
    >
      Login
    </Link>
  );
}
