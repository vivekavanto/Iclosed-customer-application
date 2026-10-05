"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

const BRAND = "#C10007";

interface LawyerOption {
  initials: string;
  fullName: string;
}

// "Choose your lawyer" landing page at /signing, for a client who doesn't
// already have a specific /signing/[initials] link. Matches
// PublicSigningBookingPage.tsx's card/brand styling.
export default function PublicSigningLawyerList() {
  const [lawyers, setLawyers] = useState<LawyerOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/signing/lawyers");
      const json = await res.json();
      if (!cancelled && json.success) setLawyers(json.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-start justify-center bg-gray-50 px-4 py-10 sm:py-16">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 sm:p-8">
        <h1 className="text-lg font-semibold text-gray-900">Book a Signing Appointment</h1>
        <p className="mt-1 text-sm text-gray-500">Choose who you&apos;re signing with.</p>

        <div className="mt-6">
          {lawyers === null ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : lawyers.length === 0 ? (
            <p className="text-sm text-gray-500">
              No lawyers are currently taking signing appointments. Please contact the office.
            </p>
          ) : (
            <div className="space-y-2">
              {lawyers.map((l) => (
                <Link
                  key={l.initials}
                  href={`/signing/${l.initials}`}
                  className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">{l.fullName}</span>
                  <ArrowRight className="h-4 w-4" style={{ color: BRAND }} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
