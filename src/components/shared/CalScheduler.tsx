"use client";

import { InlineWidget, useCalendlyEventListener } from "react-calendly";

interface CalSchedulerProps {
  /** Full Calendly URL — e.g. "https://calendly.com/navawilson/iclosed-lead-meeting" */
  url: string;
  /** Fires once the user successfully books */
  onBookingSuccess?: () => void;
  /** Optional: pre-fill name / email in the booking form */
  prefill?: { name?: string; email?: string };
  /** Height of the embedded widget (default: 660px) */
  height?: number;
}

export default function CalScheduler({
  url,
  onBookingSuccess,
  prefill,
  height = 660,
}: CalSchedulerProps) {
  useCalendlyEventListener({
    onEventScheduled: () => {
      onBookingSuccess?.();
    },
  });

  return (
    <InlineWidget
      url={url}
      styles={{ height: `${height}px`, minWidth: "100%" }}
      prefill={{
        name: prefill?.name ?? "",
        email: prefill?.email ?? "",
      }}
    />
  );
}
