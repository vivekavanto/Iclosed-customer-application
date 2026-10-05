"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Clock,
  Loader2,
  MapPin,
  Scale,
  TriangleAlert,
  Video,
} from "lucide-react";
import AddressAutocomplete from "@/components/intake/AddressAutocomplete";

// PUBLIC signing-appointment page. Rendered at both /signing (no lawyer
// chosen yet) and /signing/[lawyerInitials] (direct link from the office).
// One component so picking a lawyer and booking a time live on a single
// page/URL instead of a full navigation between two routes.
//
// All real logic (lawyer hours, blocked times, existing bookings, Google
// Calendar freebusy, event creation) lives in the admin app, which alone
// holds the Supabase service-role client and the Google service-account
// credentials. This page calls the portal's OWN /api/signing/* routes, which
// are thin server-to-server proxies to the admin app's public endpoints
// (see src/app/api/signing/** in this repo). Nothing here talks to the admin
// app directly from the browser.

const BRAND = "#C10007";

interface LawyerOption {
  initials: string;
  fullName: string;
}

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
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-[#1a1a1a] shadow-sm transition-colors focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";
const labelClass = "mb-1 block text-xs font-semibold text-gray-500";

/**
 * Reformats to (416) 555-1234 as the visitor types — same helper the contact
 * form, intake form and dashboard task drawers use, so a phone number looks
 * identical everywhere it is entered in the product.
 */
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const PHONE_RE = /^\(\d{3}\) \d{3}-\d{4}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** File numbers look like 26P-0059 — see the generator in src/lib/convertLead.ts. */
const FILE_NUMBER_RE = /^\d{2}[A-Za-z]-\d{4}$/;

/** Uppercases and auto-inserts the dash as the visitor types a file number. */
function formatFileNumber(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 7);
  if (cleaned.length <= 3) return cleaned;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
}

function IClosedLogo() {
  return (
    <div className="flex items-center select-none">
      <span
        className="text-[#C10007] font-bold italic text-xl leading-none"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        i
      </span>
      <span className="text-[#1a1a1a] font-bold text-xl leading-none tracking-tight">Closed</span>
    </div>
  );
}

function LawyerInitialsBadge({ initials, active }: { initials: string; active?: boolean }) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
      style={
        active
          ? { backgroundColor: BRAND, color: "white" }
          : { backgroundColor: `${BRAND}1a`, color: BRAND }
      }
    >
      <span className="text-xs font-bold">{initials}</span>
    </div>
  );
}

// ─── Lawyer picker (left column on desktop, first screen on mobile) ───────────
function LawyerPicker({
  lawyers,
  error,
  selected,
  onSelect,
}: {
  lawyers: LawyerOption[] | null;
  error: string | null;
  selected: string | null;
  onSelect: (initials: string) => void;
}) {
  return (
    <div className="lg:sticky lg:top-8">
      <div className="flex items-center gap-2.5 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C10007]/10 text-[#C10007]">
          <Scale className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold leading-tight text-[#1a1a1a]">Choose your lawyer</h2>
          <p className="text-xs text-gray-400">Who are you signing with?</p>
        </div>
      </div>

      <div className="mt-4">
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-[#C10007]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : lawyers === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : lawyers.length === 0 ? (
          <p className="text-sm text-gray-400">
            No lawyers are currently taking signing appointments. Please contact the office.
          </p>
        ) : (
          <div className="space-y-2">
            {lawyers.map((l) => {
              const active = selected === l.initials;
              return (
                <button
                  key={l.initials}
                  type="button"
                  onClick={() => onSelect(l.initials)}
                  className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150"
                  style={
                    active
                      ? { borderColor: BRAND, backgroundColor: `${BRAND}0d` }
                      : { borderColor: "#f3f4f6" }
                  }
                >
                  <LawyerInitialsBadge initials={l.initials} active={active} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#1a1a1a]">{l.fullName}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {active ? "Selected" : "Tap to see available times"}
                    </p>
                  </div>
                  {active && <Check className="h-4 w-4 shrink-0" style={{ color: BRAND }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PublicSigningPage({
  lawyerInitials: initialLawyerInitials,
  showOwnHeader = true,
}: {
  lawyerInitials?: string;
  /** false when hosted inside a layout that already renders its own header (e.g. the dashboard nav). */
  showOwnHeader?: boolean;
}) {
  const router = useRouter();

  const [lawyers, setLawyers] = useState<LawyerOption[] | null>(null);
  const [lawyersError, setLawyersError] = useState<string | null>(null);
  const [lawyerInitials, setLawyerInitials] = useState<string | null>(
    initialLawyerInitials ?? null,
  );

  const [date, setDate] = useState(todayLocalIso());
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const loadingSlots =
    !!lawyerInitials && availability?.date !== date && !notFound && !!lawyerInitials;

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

  /** Phone and file number are optional, so their errors only show once touched. */
  const [phoneTouched, setPhoneTouched] = useState(false);
  const phoneIncomplete =
    form.clientPhone.trim().length > 0 && !PHONE_RE.test(form.clientPhone.trim());

  const [fileNumberTouched, setFileNumberTouched] = useState(false);
  const fileNumberIncomplete =
    form.fileNumber.trim().length > 0 && !FILE_NUMBER_RE.test(form.fileNumber.trim());

  const [emailTouched, setEmailTouched] = useState(false);
  const emailIncomplete =
    emailTouched && form.clientEmail.trim().length > 0 && !EMAIL_RE.test(form.clientEmail.trim());

  // Prefill the form from the client's own intake/deal data when this page is
  // hosted inside the dashboard (a real logged-in client, not the public
  // unauthenticated /signing/[initials] link). Uses the client's most recent
  // active property — the same data the main dashboard property card shows
  // (src/app/api/dashboardproperty/route.ts). Runs once; the client can still
  // edit any field afterward.
  useEffect(() => {
    if (showOwnHeader) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboardproperty");
        const json = await res.json();
        if (cancelled || !json.success) return;

        const property = json.properties?.[0];
        if (!property) return;
        const deal = (json.deals ?? []).find((d: { id: string }) => d.id === property.deal_id);

        const side: "purchase" | "sale" | null =
          property.recipient_side ??
          (() => {
            const lt = (property.lead_type ?? "").toLowerCase();
            const combined = lt.includes("purchase") && lt.includes("sale");
            if (combined) return null;
            if (lt.includes("sale")) return "sale";
            if (lt.includes("purchase")) return "purchase";
            return null;
          })();

        const propertyAddress =
          side === "sale"
            ? [property.selling_address_street, property.selling_address_city, property.selling_address_postal_code]
                .filter(Boolean)
                .join(", ")
            : [property.address_street, property.address_city, property.address_postal_code]
                .filter(Boolean)
                .join(", ");

        const closingDate =
          (side === "sale" ? deal?.selling_closing_date : deal?.closing_date) ?? "";

        setForm((f) => ({
          ...f,
          clientName: f.clientName || `${property.first_name ?? ""} ${property.last_name ?? ""}`.trim(),
          clientEmail: f.clientEmail || property.email || "",
          clientPhone: f.clientPhone || property.phone || "",
          propertyAddress: f.propertyAddress || propertyAddress,
          closingDate: f.closingDate || closingDate,
          dealType: f.dealType || side || "",
          fileNumber: f.fileNumber || deal?.file_number || "",
        }));
      } catch {
        // Best-effort prefill — an empty form is still fully usable.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOwnHeader]);

  // Always load the lawyer list — needed for the picker, and to let a
  // direct /signing/[initials] visitor switch lawyers without round-tripping.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/signing/lawyers");
        const json = await res.json();
        if (cancelled) return;
        if (json.success) {
          setLawyers(json.data);
        } else {
          setLawyersError(json.error ?? "Could not load lawyers. Please try again.");
        }
      } catch {
        if (!cancelled) setLawyersError("Could not reach the booking service. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lawyerInitials) return;
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
      if (json.success) {
        setAvailability(json.data);
        // Auto-fill with the first available time so the booking form shows
        // right away, instead of making the client pick a slot first.
        setSelectedSlot(json.data.slots?.[0] ?? null);
      } else {
        setSelectedSlot(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, lawyerInitials]);

  function selectLawyer(initials: string) {
    setNotFound(false);
    setAvailability(null);
    setSelectedSlot(null);
    setLawyerInitials(initials);
    // Only the standalone public page (/signing/[initials]) needs this in the
    // URL, so a direct link is shareable. Inside the dashboard, navigating
    // there would strip the dashboard layout (nav header, auth) and the
    // showOwnHeader=false prefill, since (dashboard)/signing/page.tsx has no
    // [lawyerInitials] route of its own — stay on /signing and just track the
    // selection in state.
    if (showOwnHeader) {
      router.replace(`/signing/${initials}`, { scroll: false });
    }
  }

  function changeLawyer() {
    setNotFound(false);
    setAvailability(null);
    setSelectedSlot(null);
    setLawyerInitials(null);
    if (showOwnHeader) {
      router.replace("/signing", { scroll: false });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !lawyerInitials) return;
    if (!EMAIL_RE.test(form.clientEmail.trim())) {
      setEmailTouched(true);
      setError("Enter a valid email address.");
      return;
    }
    if (!form.propertyAddress.trim()) {
      setError("Enter the property address.");
      return;
    }
    if (phoneIncomplete) {
      setPhoneTouched(true);
      setError("Enter phone in (416) 555-1234 format.");
      return;
    }
    if (fileNumberIncomplete) {
      setFileNumberTouched(true);
      setError("Enter file number in 26P-0059 format.");
      return;
    }
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

  // ─── Full-bleed shell: fills almost the whole viewport instead of a small
  // centered card, with the lawyer picker and booking panel side by side.
  // When hosted inside the dashboard layout (showOwnHeader=false), that
  // layout already provides the page chrome (nav header, background, max
  // width, padding) — so skip all of it here and render just the content. ───
  const page = (children: React.ReactNode) =>
    showOwnHeader ? (
      <div className="min-h-screen bg-gray-50" style={{ ["--brand" as string]: BRAND }}>
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center px-4 sm:px-6 lg:px-8">
            <IClosedLogo />
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
      </div>
    ) : (
      <div style={{ ["--brand" as string]: BRAND }}>{children}</div>
    );

  const confirmedOrNotFound = confirmed || notFound;

  return page(
    <div
      className={
        confirmedOrNotFound
          ? "flex justify-center"
          : "grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr] lg:gap-8"
      }
    >
      {!confirmedOrNotFound && (
        <div className={lawyerInitials ? "hidden lg:block" : ""}>
          <LawyerPicker
            lawyers={lawyers}
            error={lawyersError}
            selected={lawyerInitials}
            onSelect={selectLawyer}
          />
        </div>
      )}

      <div className={confirmedOrNotFound ? "w-full max-w-lg" : "min-w-0"}>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="h-1 w-full" style={{ backgroundColor: BRAND }} />
          <div className="p-5 sm:p-6 lg:p-8">
            {notFound ? (
              <div className="py-2 text-center">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-50">
                  <TriangleAlert className="h-5 w-5 text-gray-400" />
                </div>
                <h1 className="text-base font-bold text-[#1a1a1a]">Booking page not found</h1>
                <p className="mt-1.5 text-sm text-gray-400">
                  This signing-appointment link is not valid. Please contact the office for a new
                  link.
                </p>
                <button
                  type="button"
                  onClick={changeLawyer}
                  className="mt-4 text-sm font-semibold underline"
                  style={{ color: BRAND }}
                >
                  Choose a lawyer instead
                </button>
              </div>
            ) : confirmed ? (
              <div className="py-1">
                <div
                  className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${BRAND}1a` }}
                >
                  <Check className="h-5 w-5" style={{ color: BRAND }} />
                </div>
                <h1 className="text-center text-base font-bold text-[#1a1a1a]">
                  Appointment confirmed
                </h1>
                <p className="mt-1 text-center text-sm text-gray-400">
                  A confirmation email is on its way to you.
                </p>
                <div className="mt-5 space-y-2.5 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">
                  <p className="flex items-center gap-2 font-semibold text-[#1a1a1a]">
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
                      <a
                        className="font-medium underline"
                        style={{ color: BRAND }}
                        href={confirmed.meetLink}
                      >
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
              </div>
            ) : !lawyerInitials ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center py-10 text-center">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-50">
                  <CalendarDays className="h-5 w-5 text-gray-400" />
                </div>
                <h1 className="text-base font-bold text-[#1a1a1a]">Pick a lawyer to continue</h1>
                <p className="mt-1.5 max-w-xs text-sm text-gray-400">
                  Choose who you&apos;re signing with above to see their available times.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={changeLawyer}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-50 hover:text-[#1a1a1a] lg:hidden"
                    title="Choose a different lawyer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C10007]/10 text-[#C10007]">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-sm font-bold leading-tight text-[#1a1a1a]">
                      Signing Appointment
                      {availability ? ` — ${availability.lawyer.fullName}` : ""}
                    </h1>
                    {availability && (
                      <p className="truncate text-xs text-gray-400">{availability.disclaimer}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={changeLawyer}
                    className="hidden shrink-0 text-xs font-semibold underline lg:block"
                    style={{ color: BRAND }}
                  >
                    Change lawyer
                  </button>
                </div>

                <div className="mt-4">
                  <label className={labelClass}>Date</label>
                  <input
                    type="date"
                    className={`${inputClass} max-w-[200px]`}
                    value={date}
                    min={todayLocalIso()}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div className="mt-3">
                  {loadingSlots ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading times…
                    </div>
                  ) : availability && availability.slots.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {availability.slots.map((slot) => {
                        const active = selectedSlot === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className="rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors"
                            style={
                              active
                                ? { backgroundColor: BRAND, borderColor: BRAND, color: "white" }
                                : { borderColor: "#e5e7eb", color: "#374151" }
                            }
                          >
                            {formatSlot(slot)}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No times available on this date.</p>
                  )}
                </div>

                {selectedSlot && (
                  <form onSubmit={submit} className="mt-5 space-y-3.5 border-t border-gray-100 pt-5">
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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
                          inputMode="email"
                          autoComplete="email"
                          className={inputClass}
                          value={form.clientEmail}
                          onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                          onBlur={() => setEmailTouched(true)}
                          aria-invalid={emailIncomplete}
                        />
                        {emailIncomplete && (
                          <p className="mt-1 text-xs text-[#C10007]">
                            Enter a valid email address.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Phone</label>
                        <input
                          type="tel"
                          inputMode="tel"
                          placeholder="(416) 555-1234"
                          className={inputClass}
                          value={form.clientPhone}
                          onChange={(e) =>
                            setForm({ ...form, clientPhone: formatPhone(e.target.value) })
                          }
                          onBlur={() => setPhoneTouched(true)}
                          aria-invalid={phoneTouched && phoneIncomplete}
                        />
                        {phoneTouched && phoneIncomplete && (
                          <p className="mt-1 text-xs text-[#C10007]">
                            Enter phone in (416) 555-1234 format.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className={labelClass}>File number</label>
                        <input
                          placeholder="26P-0059"
                          className={inputClass}
                          value={form.fileNumber}
                          onChange={(e) =>
                            setForm({ ...form, fileNumber: formatFileNumber(e.target.value) })
                          }
                          onBlur={() => setFileNumberTouched(true)}
                          aria-invalid={fileNumberTouched && fileNumberIncomplete}
                        />
                        {fileNumberTouched && fileNumberIncomplete && (
                          <p className="mt-1 text-xs text-[#C10007]">
                            Enter file number in 26P-0059 format.
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Property address *</label>
                      <AddressAutocomplete
                        value={form.propertyAddress}
                        onChange={(val) => setForm({ ...form, propertyAddress: val })}
                        onSelect={({ street, city, postalCode }) =>
                          setForm({
                            ...form,
                            propertyAddress: [street, city, postalCode].filter(Boolean).join(", "),
                          })
                        }
                        placeholder="123 Main Street, Toronto"
                        inputClassName={`${inputClass} pl-9`}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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
                      <label className={labelClass}>
                        Additional guest emails (comma separated, optional)
                      </label>
                      <input
                        className={inputClass}
                        value={form.extraGuestsText}
                        onChange={(e) => setForm({ ...form, extraGuestsText: e.target.value })}
                      />
                    </div>

                    {error && (
                      <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-[#C10007]">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-60 sm:w-auto"
                      style={{ backgroundColor: BRAND }}
                    >
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {submitting ? "Booking…" : "Schedule Event"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
  );
}
