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
import SiteHeader from "@/components/layout/SiteHeader";

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
  /** Appointment length from the admin app's signing settings. */
  durationMinutes?: number;
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
  // 1 = choose lawyer/date/time, 2 = enter details.
  const [step, setStep] = useState<1 | 2>(1);
  const selectedLawyerName =
    lawyers?.find((l) => l.initials === lawyerInitials)?.fullName ??
    availability?.lawyer.fullName ??
    "";
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
      try {
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
          // The client picks the time themselves — never pre-select one.
        } else {
          setSelectedSlot(null);
        }
      } catch {
        // Non-JSON response (e.g. an HTML error page) — treat as no slots.
        if (!cancelled) setSelectedSlot(null);
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
    if (showOwnHeader && initialLawyerInitials) {
      router.replace(`/signing/${initials}`, { scroll: false });
    }
  }

  function changeLawyer() {
    setStep(1);
    setNotFound(false);
    setAvailability(null);
    setSelectedSlot(null);
    setLawyerInitials(null);
    if (showOwnHeader && initialLawyerInitials) {
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
    } catch {
      setError("Could not reach the booking service. Please try again.");
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
        <SiteHeader />
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-24">{children}</div>
      </div>
    ) : (
      <div style={{ ["--brand" as string]: BRAND }}>{children}</div>
    );

  const confirmedOrNotFound = confirmed || notFound;

  return page(
    <div className={confirmedOrNotFound ? "flex justify-center" : ""}>
      {confirmedOrNotFound ? (
        <div className="w-full max-w-lg">
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
                    This signing-appointment link is not valid. Please contact the office for a
                    new link.
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
              ) : (
                confirmed && (
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
                )
              )}
            </div>
          </div>
        </div>
      ) : step === 1 || !selectedSlot || !lawyerInitials ? (
        /* ── Step 1: choose lawyer, date and time ── */
        <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="h-1 w-full" style={{ backgroundColor: BRAND }} />
          <div className="p-5 sm:p-6 lg:p-8">
            <h1 className="text-base font-bold leading-tight text-[#1a1a1a]">
              Book a Signing Appointment
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Step 1 of 2 — choose your lawyer, date and time.
            </p>

            <div className="mt-5">
              <label className={labelClass}>Lawyer</label>
              {lawyers === null ? (
                <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : lawyersError ? (
                <p className="text-sm text-[#C10007]">{lawyersError}</p>
              ) : lawyers.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No lawyers are currently taking signing appointments.
                </p>
              ) : (
                <select
                  className={inputClass}
                  value={lawyerInitials ?? ""}
                  onChange={(e) => {
                    if (e.target.value) selectLawyer(e.target.value);
                  }}
                >
                  <option value="" disabled>
                    Select a lawyer…
                  </option>
                  {lawyers.map((l) => (
                    <option key={l.initials} value={l.initials}>
                      {l.fullName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {lawyerInitials && (
              <>
                <div className="mt-4">
                  <label className={labelClass}>Date</label>
                  <input
                    type="date"
                    className={`${inputClass} max-w-[200px]`}
                    value={date}
                    min={todayLocalIso()}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setSelectedSlot(null);
                    }}
                  />
                </div>

                <div className="mt-4">
                  <label className={labelClass}>Time</label>
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
                  <p className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    {availability?.durationMinutes ? `${availability.durationMinutes} min · ` : ""}
                    Eastern Time - US &amp; Canada
                  </p>
                </div>

                {availability?.disclaimer && (
                  <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-500 ring-1 ring-gray-100">
                    {availability.disclaimer}
                  </p>
                )}
              </>
            )}

            <button
              type="button"
              disabled={!lawyerInitials || !selectedSlot}
              onClick={() => setStep(2)}
              className="mt-6 flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              style={{ backgroundColor: BRAND }}
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        /* ── Step 2: enter details; left panel summarises the choices made in step 1 ── */
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm lg:grid-cols-[320px_1fr]">
          <div className="border-b border-gray-100 bg-gray-50/60 p-5 sm:p-6 lg:border-b-0 lg:border-r lg:self-start lg:sticky lg:top-8">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mb-4 inline-flex items-center gap-1 text-xs font-semibold"
              style={{ color: BRAND }}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back to change
            </button>

            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#C10007]/10 text-[#C10007]">
                <Scale className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Lawyer
                </p>
                <p className="truncate text-sm font-semibold text-[#1a1a1a]">{selectedLawyerName}</p>
              </div>
            </div>

            <div className="mt-5 border-t border-gray-100 pt-5">
              <h1 className="text-base font-bold leading-tight text-[#1a1a1a]">
                Signing Appointment
              </h1>
              <p className="mt-0.5 text-sm text-gray-500">{selectedLawyerName}</p>

              {availability?.durationMinutes ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                  {availability.durationMinutes} min
                </div>
              ) : null}

              <div className="mt-2 flex items-start gap-2 text-sm font-medium text-[#1a1a1a]">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND }} />
                <span>
                  {new Date(selectedSlot).toLocaleString("en-US", {
                    timeZone: "America/Toronto",
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                  <br />
                  {formatSlot(selectedSlot)}
                </span>
              </div>

              <div className="mt-2 flex items-start gap-2 text-sm text-gray-600">
                {form.appointmentType === "virtual" ? (
                  <>
                    <Video className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" /> Google Meet
                  </>
                ) : (
                  <>
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    {availability?.officeAddress ?? "In person"}
                  </>
                )}
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-gray-300" />
                Eastern Time - US &amp; Canada
              </div>

              {availability?.disclaimer && (
                <p className="mt-4 rounded-lg bg-white p-3 text-xs leading-relaxed text-gray-500 ring-1 ring-gray-100">
                  {availability.disclaimer}
                </p>
              )}
            </div>
          </div>

          {/* ── Right details panel ── */}
          <div className="p-5 sm:p-6 lg:p-8">
            {(
              <div>
                <h2 className="text-base font-bold text-[#1a1a1a]">Enter Details</h2>

                <form onSubmit={submit} className="mt-4 space-y-3.5">
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
                    <label className={labelClass}>
                      Additional guest emails (comma separated, optional)
                    </label>
                    <input
                      className={inputClass}
                      placeholder="Add guests"
                      value={form.extraGuestsText}
                      onChange={(e) => setForm({ ...form, extraGuestsText: e.target.value })}
                    />
                  </div>

                  <div>
                    <span className={labelClass}>Location *</span>
                    <div className="space-y-2">
                      <label
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm text-gray-700 transition-colors"
                        style={
                          form.appointmentType === "in_person"
                            ? { borderColor: BRAND, backgroundColor: `${BRAND}0d` }
                            : { borderColor: "#e5e7eb" }
                        }
                      >
                        <input
                          type="radio"
                          name="appointmentType"
                          checked={form.appointmentType === "in_person"}
                          onChange={() => setForm({ ...form, appointmentType: "in_person" })}
                        />
                        <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                        In person
                        {availability ? ` — ${availability.officeAddress}` : ""}
                      </label>
                      <label
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm text-gray-700 transition-colors"
                        style={
                          form.appointmentType === "virtual"
                            ? { borderColor: BRAND, backgroundColor: `${BRAND}0d` }
                            : { borderColor: "#e5e7eb" }
                        }
                      >
                        <input
                          type="radio"
                          name="appointmentType"
                          checked={form.appointmentType === "virtual"}
                          onChange={() => setForm({ ...form, appointmentType: "virtual" })}
                        />
                        <Video className="h-4 w-4 shrink-0 text-gray-400" />
                        Google Meet
                      </label>
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

                  <div>
                    <label className={labelClass}>Closing date</label>
                    <input
                      type="date"
                      className={`${inputClass} max-w-[200px]`}
                      value={form.closingDate}
                      onChange={(e) => setForm({ ...form, closingDate: e.target.value })}
                    />
                  </div>

                  <div>
                    <span className={labelClass}>Is this a purchase, sale or refinance? *</span>
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-700">
                        <input
                          type="radio"
                          name="dealType"
                          checked={form.dealType === "purchase"}
                          onChange={() => setForm({ ...form, dealType: "purchase" })}
                        />
                        Purchase
                      </label>
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-700">
                        <input
                          type="radio"
                          name="dealType"
                          checked={form.dealType === "sale"}
                          onChange={() => setForm({ ...form, dealType: "sale" })}
                        />
                        Sale
                      </label>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed text-gray-400">
                    By proceeding, you confirm that you have read and agree to iClosed&apos;s
                    Participant Terms and Privacy Notice.
                  </p>

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
              </div>
            )}
          </div>
        </div>
      )}
    </div>,
  );
}
