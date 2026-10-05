"use client";

import React, { useEffect, useState } from "react";
import { CalendarDays, Check, Clock, Loader2, MapPin, Video } from "lucide-react";

// PUBLIC signing-appointment booking page, rendered at /signing/[lawyerInitials].
//
// All real logic (lawyer hours, blocked times, existing bookings, Google
// Calendar freebusy, event creation) lives in the admin app, which alone
// holds the Supabase service-role client and the Google service-account
// credentials. This page calls the portal's OWN /api/signing/* routes, which
// are thin server-to-server proxies to the admin app's public endpoints
// (see src/app/api/signing/** in this repo). Nothing here talks to the admin
// app directly from the browser.

const BRAND = "#C10007";

interface AvailabilityData {
  lawyer: { initials: string; fullName: string };
  date: string;
  officeAddress: string;
  disclaimer: string;
  slots: string[];
}

interface ConfirmedBooking {
  startAt: string;
  lawyerName: string;
  location: string;
  meetLink: string | null;
  manageUrl: string;
}

function todayLocalIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatSlot(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";
const labelClass = "mb-1 block text-xs font-medium text-gray-600";

export default function PublicSigningBookingPage({ lawyerInitials }: { lawyerInitials: string }) {
  const [date, setDate] = useState(todayLocalIso());
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const loadingSlots = availability?.date !== date && !notFound;

  const [form, setForm] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    propertyAddress: "",
    closingDate: "",
    dealType: "",
    appointmentType: "in_person",
    fileNumber: "",
    extraGuestsText: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/signing/lawyers/${lawyerInitials}/availability?date=${date}`);
      if (cancelled) return;
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const json = await res.json();
      if (cancelled) return;
      if (json.success) setAvailability(json.data);
      setSelectedSlot(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [date, lawyerInitials]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/signing/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawyerInitials,
          startAt: selectedSlot,
          clientName: form.clientName,
          clientEmail: form.clientEmail,
          clientPhone: form.clientPhone || undefined,
          propertyAddress: form.propertyAddress || undefined,
          closingDate: form.closingDate || undefined,
          dealType: form.dealType || undefined,
          appointmentType: form.appointmentType,
          fileNumber: form.fileNumber || undefined,
          extraGuests: form.extraGuestsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Could not book that time.");
        return;
      }
      setConfirmed(json.data);
    } finally {
      setSubmitting(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div
      className="flex min-h-screen items-start justify-center bg-gray-50 px-4 py-10 sm:py-16"
      style={{ ["--brand" as string]: BRAND }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 sm:p-8">
        {children}
      </div>
    </div>
  );

  if (notFound) {
    return shell(
      <div className="py-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Booking page not found</h1>
        <p className="mt-2 text-sm text-gray-500">
          This signing-appointment link is not valid. Please contact the office for a new link.
        </p>
      </div>,
    );
  }

  if (confirmed) {
    return shell(
      <div>
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: `${BRAND}1a` }}
        >
          <Check className="h-6 w-6" style={{ color: BRAND }} />
        </div>
        <h1 className="text-center text-lg font-semibold text-gray-900">Appointment confirmed</h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          A confirmation email is on its way to you.
        </p>
        <div className="mt-6 space-y-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
          <p className="flex items-center gap-2 font-medium text-gray-900">
            <CalendarDays className="h-4 w-4 shrink-0" style={{ color: BRAND }} />
            {new Date(confirmed.startAt).toLocaleString("en-US", {
              timeZone: "America/Toronto",
              dateStyle: "full",
              timeStyle: "short",
            })}
          </p>
          <p className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-gray-400" />
            With {confirmed.lawyerName}
          </p>
          {confirmed.meetLink ? (
            <p className="flex items-center gap-2">
              <Video className="h-4 w-4 shrink-0 text-gray-400" />
              <a className="font-medium underline" style={{ color: BRAND }} href={confirmed.meetLink}>
                Join on Google Meet
              </a>
            </p>
          ) : (
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
              {confirmed.location}
            </p>
          )}
        </div>
        <p className="mt-5 text-center text-sm text-gray-500">
          Need to change this?{" "}
          <a className="font-medium underline" style={{ color: BRAND }} href={confirmed.manageUrl}>
            Manage your appointment
          </a>
        </p>
      </div>,
    );
  }

  return shell(
    <div>
      <h1 className="text-lg font-semibold text-gray-900">
        Signing Appointment{availability ? ` — ${availability.lawyer.fullName}` : ""}
      </h1>
      {availability && <p className="mt-1 text-sm text-gray-500">{availability.disclaimer}</p>}

      <div className="mt-6">
        <label className={labelClass}>Date</label>
        <input
          type="date"
          className={`${inputClass} max-w-[200px]`}
          value={date}
          min={todayLocalIso()}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="mt-4">
        {loadingSlots ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading times…
          </p>
        ) : availability && availability.slots.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {availability.slots.map((slot) => {
              const active = selectedSlot === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
                  style={
                    active
                      ? { backgroundColor: BRAND, borderColor: BRAND, color: "white" }
                      : { borderColor: "#d1d5db", color: "#374151" }
                  }
                >
                  {formatSlot(slot)}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No times available on this date.</p>
        )}
      </div>

      {selectedSlot && (
        <form onSubmit={submit} className="mt-6 space-y-4 border-t border-gray-100 pt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Name *</label>
              <input
                required
                className={inputClass}
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Email *</label>
              <input
                required
                type="email"
                className={inputClass}
                value={form.clientEmail}
                onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Phone</label>
              <input
                className={inputClass}
                value={form.clientPhone}
                onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>File number</label>
              <input
                className={inputClass}
                value={form.fileNumber}
                onChange={(e) => setForm({ ...form, fileNumber: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Property address *</label>
            <input
              required
              className={inputClass}
              value={form.propertyAddress}
              onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Closing date</label>
              <input
                type="date"
                className={inputClass}
                value={form.closingDate}
                onChange={(e) => setForm({ ...form, closingDate: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Transaction type *</label>
              <select
                required
                className={inputClass}
                value={form.dealType}
                onChange={(e) => setForm({ ...form, dealType: e.target.value })}
              >
                <option value="" disabled>
                  Select…
                </option>
                <option value="purchase">Purchase</option>
                <option value="sale">Sale</option>
              </select>
            </div>
          </div>
          <div>
            <span className={labelClass}>Appointment type *</span>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="appointmentType"
                  checked={form.appointmentType === "in_person"}
                  onChange={() => setForm({ ...form, appointmentType: "in_person" })}
                />
                In person{availability ? ` (${availability.officeAddress})` : ""}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="appointmentType"
                  checked={form.appointmentType === "virtual"}
                  onChange={() => setForm({ ...form, appointmentType: "virtual" })}
                />
                Virtual (Google Meet)
              </label>
            </div>
          </div>
          <div>
            <label className={labelClass}>Additional guest emails (comma separated, optional)</label>
            <input
              className={inputClass}
              value={form.extraGuestsText}
              onChange={(e) => setForm({ ...form, extraGuestsText: e.target.value })}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-60 sm:w-auto"
            style={{ backgroundColor: BRAND }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Booking…" : "Schedule Event"}
          </button>
        </form>
      )}
    </div>,
  );
}
