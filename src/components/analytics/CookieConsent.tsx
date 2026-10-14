"use client";

import { useEffect, useState } from "react";
import { readConsent, saveConsent } from "@/components/analytics/consent";

/** Accept/decline banner for analytics cookies. Only rendered when GA is enabled. */
export default function CookieConsent({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(enabled && readConsent() === null);
  }, [enabled]);

  if (!visible) return null;

  const choose = (choice: "granted" | "denied") => {
    saveConsent(choice);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-700">
          We use analytics cookies to understand how visitors use our website
          and improve it. You can accept or decline.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
