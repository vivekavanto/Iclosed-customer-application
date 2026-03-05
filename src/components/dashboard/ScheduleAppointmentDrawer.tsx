"use client";

import { useEffect, useState } from "react";
import { X, CalendarCheck, CheckCircle2 } from "lucide-react";
import Button from "@/components/ui/Button";

interface ScheduleAppointmentDrawerProps {
  open: boolean;
  onClose: () => void;
  calendlyUrl?: string;
}

const WHAT_TO_EXPECT = [
  "Document signing and review session",
  "Final questions and clarifications",
  "Next steps guidance for your closing",
];

export default function ScheduleAppointmentDrawer({
  open,
  onClose,
  calendlyUrl = "https://calendly.com",
}: ScheduleAppointmentDrawerProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) handleClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function handleClose() {
    setConfirmed(false);
    setMarked(false);
    onClose();
  }

  async function handleMarkScheduled() {
    if (!confirmed) return;
    setMarking(true);
    try {
      // TODO: wire to API to mark task as scheduled/completed
      await new Promise((r) => setTimeout(r, 700));
      setMarked(true);
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          "fixed inset-0 z-40 bg-black/30 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={[
          "fixed top-0 right-0 z-50 h-full w-full max-w-[500px] bg-white shadow-2xl",
          "flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label="Schedule an Appointment"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-base font-bold text-gray-900 leading-snug">
              Schedule an Appointment
            </h2>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Select a date for document signing and book your appointment time.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="cursor-pointer flex-shrink-0 rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* Book Your Appointment — red left border card */}
          <div className="rounded-xl border border-[#fca5a5] bg-[#FEF2F2] border-l-4 border-l-[#C10007] px-5 py-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/70 border border-[#fca5a5] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C10007" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </div>
              <p className="text-sm font-bold text-gray-900">Book Your Appointment Time</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Click the link below to choose your preferred date and time for your appointment through our scheduling system.
            </p>
            <a
              href={calendlyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              {/* Calendly-style icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
              </svg>
              Open Calendly to Schedule Appointment
            </a>
          </div>

          {/* What to Expect */}
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
            <p className="text-sm font-bold text-gray-900 mb-3">What to Expect</p>
            <ul className="space-y-2.5">
              {WHAT_TO_EXPECT.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full bg-[#C10007]" />
                  <span className="text-xs text-gray-600 leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Confirmation checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group select-none">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => {
                  setConfirmed(e.target.checked);
                  if (!e.target.checked) setMarked(false);
                }}
                disabled={marked}
                className="sr-only"
              />
              <div className={[
                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-150",
                confirmed
                  ? "bg-[#C10007] border-[#C10007]"
                  : "border-gray-300 bg-white group-hover:border-[#C10007]/60",
                marked ? "opacity-60" : "",
              ].join(" ")}>
                {confirmed && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            </div>
            <span className={[
              "text-sm leading-snug pt-0.5",
              confirmed ? "text-gray-800 font-medium" : "text-gray-500",
            ].join(" ")}>
              I have scheduled the appointment through Calendly
            </span>
          </label>

          {/* Success state */}
          {marked && (
            <div className="flex items-center gap-2.5 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
              <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" strokeWidth={2.5} />
              <p className="text-xs font-semibold text-green-700">
                Appointment marked as scheduled successfully.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={handleClose}
            disabled={marking}
            className="sm:flex-1"
          >
            Close
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={!confirmed || marking || marked}
            loading={marking}
            onClick={handleMarkScheduled}
            className="sm:flex-1 disabled:opacity-40"
          >
            <CalendarCheck size={15} strokeWidth={2} />
            {marked ? "Marked as Scheduled" : "Mark as Scheduled"}
          </Button>
        </div>
      </div>
    </>
  );
}
