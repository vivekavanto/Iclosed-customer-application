"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, Mail } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

const CONTACT_EMAIL = "hello@iclosed.ca";

/**
 * Reformats to (416) 555-1234 as the visitor types — the same helper the intake
 * form and the dashboard task drawers use, so a phone number looks identical
 * everywhere it is entered in the product.
 */
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const PHONE_RE = /^\(\d{3}\) \d{3}-\d{4}$/;

const inputClass =
  "w-full px-4 py-2.5 rounded-sm border text-sm border-gray-200 bg-white text-gray-900 outline-none focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10 transition-colors";

interface FormState {
  name: string;
  email: string;
  phone: string;
  message: string;
  /** Honeypot — hidden from people, irresistible to bots. */
  company: string;
}

const EMPTY: FormState = {
  name: "",
  email: "",
  phone: "",
  message: "",
  company: "",
};

export default function ContactForm() {
  const { error: toastError } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  /** Phone is optional, so its error only shows once they've actually typed. */
  const [phoneTouched, setPhoneTouched] = useState(false);

  const phoneIncomplete =
    form.phone.trim().length > 0 && !PHONE_RE.test(form.phone.trim());

  const set = (field: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // Mirrors the server's checks so the common mistakes never cost a round
    // trip; the server is still the one that decides.
    if (!form.name.trim()) return toastError("Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      return toastError("Please enter a valid email address.");
    if (phoneIncomplete) {
      setPhoneTouched(true);
      return toastError("Enter phone in (416) 555-1234 format.");
    }
    if (form.message.trim().length < 5)
      return toastError("Please enter your message.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        toastError(
          data?.error ||
            `We couldn't send your message. Please email ${CONTACT_EMAIL} directly.`,
        );
        return;
      }

      setForm(EMPTY);
      setSent(true);
    } catch {
      toastError(
        `We couldn't reach our servers. Please email ${CONTACT_EMAIL} directly.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 sm:p-10 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#C10007]/10">
          <CheckCircle2 className="h-6 w-6 text-[#C10007]" strokeWidth={2} />
        </div>
        <h2 className="mt-4 text-xl font-bold text-gray-900">
          Thanks — your message is on its way
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500">
          A member of our team will get back to you at the email you provided,
          usually within one business day.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-6 text-sm font-semibold text-[#C10007] hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="contact-name"
            className="mb-1.5 block text-sm font-medium text-gray-900"
          >
            Name <span className="text-[#C10007]">*</span>
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={120}
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            placeholder="Jane Doe"
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="contact-email"
            className="mb-1.5 block text-sm font-medium text-gray-900"
          >
            Email <span className="text-[#C10007]">*</span>
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={200}
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
            placeholder="jane@example.com"
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-5">
        <label
          htmlFor="contact-phone"
          className="mb-1.5 block text-sm font-medium text-gray-900"
        >
          Phone number{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={14}
          value={form.phone}
          onChange={(e) => set("phone")(formatPhone(e.target.value))}
          onBlur={() => setPhoneTouched(true)}
          aria-invalid={phoneTouched && phoneIncomplete}
          placeholder="(416) 555-1234"
          className={`${inputClass} ${
            phoneTouched && phoneIncomplete
              ? "border-red-400 focus:border-red-400 focus:ring-red-100"
              : ""
          }`}
        />
        {phoneTouched && phoneIncomplete && (
          <p className="mt-1.5 text-xs text-red-600">
            Enter a 10-digit number in (416) 555-1234 format.
          </p>
        )}
      </div>

      <div className="mt-5">
        <label
          htmlFor="contact-message"
          className="mb-1.5 block text-sm font-medium text-gray-900"
        >
          Message <span className="text-[#C10007]">*</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          maxLength={4000}
          value={form.message}
          onChange={(e) => set("message")(e.target.value)}
          placeholder="Tell us a little about your closing or your question…"
          className={`${inputClass} resize-y leading-relaxed`}
        />
        <p className="mt-1.5 text-xs text-gray-400">
          {form.message.length}/4000
        </p>
      </div>

      {/* Honeypot — hidden from people and from screen readers, not from bots. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="contact-company">Company</label>
        <input
          id="contact-company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.company}
          onChange={(e) => set("company")(e.target.value)}
        />
      </div>

      <div className="mt-7 flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-between">
        <p className="text-center text-xs text-gray-400 sm:text-left">
          Or email us directly at{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-semibold text-[#C10007] hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-[#C10007] px-8 py-3 text-sm font-semibold !text-white shadow-sm transition-colors hover:bg-[#a00006] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" />
              Send message
            </>
          )}
        </button>
      </div>
    </form>
  );
}
