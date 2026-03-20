"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileText, MapPin, Tag, Shield, ArrowRight } from "lucide-react";
import FAQAccordion, { FAQItem } from "@/components/retainer/FAQAccordion";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

/* ═══════════════════════════════════════════
   FAQ DATA
═══════════════════════════════════════════ */
const faqItems: FAQItem[] = [
  {
    question: "Who are we?",
    answer:
      "We are iClosed, a fully online Ontario law firm focused exclusively on real estate transactions. We handle purchases, sales, refinances, and title transfers—all through secure digital platforms, including video signing.",
  },
  {
    question: "Who is the lawyer or law firm representing me?",
    answer:
      "Your transaction will be handled by a licensed Ontario lawyer at iClosed. Our team specializes in real estate closings and will be your point of contact throughout the entire process.",
  },
  {
    question: "What legal services are included in this retainer?",
    answer:
      "Our retainer covers the full scope of legal work needed to close your real estate transaction, including title search, document preparation, registration, and trust account management.",
  },
  {
    question: "How much will it cost?",
    answer:
      "Our fees are transparent and competitive. The exact cost depends on the type and complexity of your transaction. A detailed fee breakdown will be provided before you proceed.",
  },
  {
    question: "Are there any additional costs I should know about?",
    answer:
      "In addition to legal fees, there may be disbursements such as title insurance, registration fees, and land transfer tax. We will provide a full estimate of all costs upfront so there are no surprises.",
  },
  {
    question: "How do I sign documents and communicate with you?",
    answer:
      "All documents can be signed electronically through our secure platform. You can communicate with our team via email, phone, or through your client portal at any time.",
  },
  {
    question: "How do I provide my ID and documents?",
    answer:
      "You can securely upload your identification and documents through your iClosed client portal. We accept standard government-issued photo ID and will guide you through the process.",
  },
  {
    question: "How long does this retainer last?",
    answer:
      "This retainer remains in effect until your real estate transaction is completed and all related legal matters are resolved. You may terminate the retainer at any time by providing written notice.",
  },
  {
    question: "What are your obligations as our client?",
    answer:
      "As our client, you are expected to provide accurate information, respond to requests in a timely manner, and ensure funds are available when required for closing.",
  },
  {
    question: "What happens if I want to cancel?",
    answer:
      "You have the right to cancel this retainer at any time. If you cancel, you will only be responsible for fees and disbursements incurred up to the date of cancellation.",
  },
  {
    question: "Is this agreement legally binding?",
    answer:
      "Yes, once you sign and submit this retainer agreement, it becomes a legally binding contract between you and iClosed for the provision of legal services related to your transaction.",
  },
  {
    question: "Who can I contact with questions?",
    answer:
      "You can reach our team through your client portal, by email, or by phone during business hours. Your assigned closing manager will be your primary point of contact.",
  },
];

/* ═══════════════════════════════════════════
   VALIDATION
═══════════════════════════════════════════ */
interface FormErrors {
  name?: string;
  date?: string;
  signature?: string;
}

function validate(name: string, date: string, signature: string): FormErrors {
  const errors: FormErrors = {};

  if (!name.trim()) {
    errors.name = "Your name is required";
  } else if (name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters";
  }

  if (!date) {
    errors.date = "Please choose a date";
  }

  if (!signature.trim()) {
    errors.signature = "Signature is required";
  } else if (signature.trim().length < 2) {
    errors.signature = "Signature must be at least 2 characters";
  }

  return errors;
}

/* ═══════════════════════════════════════════
   PAGE COMPONENT
═══════════════════════════════════════════ */
export default function RetainerPage() {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [signature, setSignature] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const validationErrors = validate(name, date, signature);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/retainer/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: name,
          signature,
          signed_date: date,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors({ name: data.error || "Something went wrong. Please try again." });
        return;
      }

      setSubmitted(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 2000);
    } catch {
      setErrors({ name: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  /* ── Success State ── */
  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto mt-8 sm:mt-16">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center">
            <svg className="w-10 h-10 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-text-heading)] mb-3">
            Agreement Submitted
          </h1>
          <p className="text-[var(--color-text-body)] max-w-md mx-auto">
            Thank you for signing the retainer agreement. Our team will review and be in touch shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* ═══════════════════════════════════════
         TOP BANNER — red gradient header
      ═══════════════════════════════════════ */}
      <div className="rounded-2xl bg-gradient-to-br from-[#c0392b] to-[#922b21] text-white p-6 sm:p-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <FileText size={24} strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Retainer Agreement</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-white/80">
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} />
                  10 Milner Business Ct, Scarborough, ON
                </span>
                <span className="flex items-center gap-1.5">
                  <Tag size={14} />
                  Purchase
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-semibold tracking-wide">
              Page 1 of 1
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
         MAIN CONTENT — two-column on desktop
      ═══════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* ── Left: Engagement Letter + FAQ ── */}
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
          {/* Section header */}
          <div className="px-5 py-4 sm:px-7 sm:py-5 border-b border-[var(--color-border)]">
            <h2 className="text-lg font-bold text-[var(--color-text-heading)]">
              Engagement Letter
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              Please review each section before signing below.
            </p>
          </div>

          {/* FAQ list */}
          <div className="px-5 sm:px-7">
            <FAQAccordion items={faqItems} />
          </div>
        </div>

        {/* ── Right: Sidebar info cards ── */}
        <div className="flex flex-col gap-4">
          {/* Security notice */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                <Shield size={18} className="text-[var(--color-success)]" strokeWidth={2} />
              </div>
              <h3 className="text-sm font-bold text-[var(--color-text-heading)]">
                Secure & Confidential
              </h3>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              This agreement is transmitted and stored securely. Your personal information is protected under our privacy policy and applicable Ontario regulations.
            </p>
          </div>

          {/* Quick summary */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5">
            <h3 className="text-sm font-bold text-[var(--color-text-heading)] mb-3">
              What you&apos;re agreeing to
            </h3>
            <ul className="space-y-2.5">
              {[
                "Legal representation by iClosed",
                "Digital document signing & communication",
                "Transparent fee structure",
                "Right to cancel at any time",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-xs text-[var(--color-text-body)]">
                  <ArrowRight size={12} className="flex-shrink-0 mt-0.5 text-[var(--color-primary)]" strokeWidth={2.5} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact card */}
          <div className="bg-[var(--color-bg-alt)] rounded-2xl border border-[var(--color-border)] p-5">
            <h3 className="text-sm font-bold text-[var(--color-text-heading)] mb-1">
              Questions?
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              Contact your closing manager through the client portal or email us at{" "}
              <a href="mailto:support@iclosed.ca" className="text-[var(--color-primary)] hover:underline">
                support@iclosed.ca
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
         SIGNATURE SECTION
      ═══════════════════════════════════════ */}
      <form onSubmit={handleSubmit} className="mt-6" noValidate>
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
          {/* Signature header bar */}
          <div className="px-5 py-4 sm:px-7 sm:py-5 border-b border-[var(--color-border)] bg-[var(--color-bg-alt)]">
            <h3 className="text-base font-bold text-[var(--color-text-heading)]">
              Signature / Acceptance
            </h3>
            <p className="text-sm text-[var(--color-text-body)] mt-0.5">
              I agree to retain iClosed to represent me in my real estate transaction under the terms outlined above.
            </p>
          </div>

          {/* Signature fields */}
          <div className="px-5 py-5 sm:px-7 sm:py-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Input
                label="Enter your name"
                required
                placeholder="Your name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                error={errors.name}
              />

              <div className="flex flex-col gap-1.5 w-full">
                <label
                  htmlFor="retainer-date"
                  className="text-sm font-medium text-[var(--color-text-heading)]"
                >
                  Choose Date<span className="text-red-600 ml-1">*</span>
                </label>
                <input
                  id="retainer-date"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }));
                  }}
                  className={[
                    "w-full px-4 py-2.5 rounded-sm border text-sm transition-colors duration-150",
                    "bg-[var(--color-surface)] text-[var(--color-text-heading)]",
                    "placeholder:text-[var(--color-text-muted)]",
                    errors.date
                      ? "border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                      : "border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)]",
                  ].join(" ")}
                />
                {errors.date && (
                  <p className="text-xs text-red-600 mt-0.5">{errors.date}</p>
                )}
              </div>

              <Input
                label="Enter your full name"
                hint="(Signature)"
                required
                placeholder="Type your full name"
                value={signature}
                onChange={(e) => {
                  setSignature(e.target.value);
                  if (errors.signature) setErrors((prev) => ({ ...prev, signature: undefined }));
                }}
                error={errors.signature}
              />
            </div>

            {/* Live signature preview */}
            {signature.trim() && (
              <div className="mt-5 pt-5 border-t border-dashed border-[var(--color-border)]">
                <p className="text-xs text-[var(--color-text-muted)] mb-2">Signature Preview</p>
                <p
                  className="text-2xl text-[var(--color-text-heading)] tracking-wide"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
                >
                  {signature}
                </p>
              </div>
            )}
          </div>

          {/* Footer with button + privacy */}
          <div className="px-5 py-4 sm:px-7 sm:py-5 border-t border-[var(--color-border)] bg-[var(--color-bg-alt)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-[var(--color-text-muted)]">
              By submitting, you agree to our{" "}
              <a
                href="/privacy-policy"
                className="text-[var(--color-primary)] hover:underline"
              >
                privacy policy
              </a>{" "}
              and terms of service.
            </p>
            <Button type="submit" size="lg" loading={loading}>
              Submit Agreement
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
