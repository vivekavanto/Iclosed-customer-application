"use client";

import { useState, useEffect, FormEvent } from "react";
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
      "We are iClosed, a fully online Ontario law firm focused exclusively on real estate transactions. We handle purchases, sales, refinances, and title transfers\u2014all through secure digital platforms, including video signing.",
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
  const [propertyAddress, setPropertyAddress] = useState("");
  const [leadType, setLeadType] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function prefill() {
      try {
        const res = await fetch("/api/retainer/check");
        const data = await res.json();
        if (data.full_name) {
          setName(data.full_name);
          setSignature(data.full_name);
        }
        if (data.signed_date) {
          setDate(data.signed_date);
        }
        if (data.property_address) {
          setPropertyAddress(data.property_address);
        }
        if (data.lead_type) {
          setLeadType(data.lead_type);
        }
      } catch {
        // silently fail — user can fill manually
      }
    }
    prefill();
  }, []);

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

  /* Success State */
  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-green-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Agreement Submitted
          </h1>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Thank you for signing the retainer agreement. Our team will review and be in touch shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ═══════════════════════════════════════
         DOCUMENT HEADER
      ═══════════════════════════════════════ */}
      <div className="px-6 py-8 sm:px-10 sm:py-10 lg:px-16 lg:py-12 flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Retainer Agreement
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {propertyAddress || "Address not available"}
          </p>
          <p className="text-sm text-gray-400 mt-0.5">
            Transaction Type: {leadType || "N/A"}
          </p>
        </div>
        <span className="flex-shrink-0 w-11 h-11 rounded-full border-2 border-[#C10007] flex items-center justify-center text-sm font-bold text-[#C10007]">
          1/1
        </span>
      </div>

      {/* Divider */}
      <div className="mx-6 sm:mx-10 lg:mx-16 border-t border-gray-200" />

      {/* ═══════════════════════════════════════
         ENGAGEMENT LETTER
      ═══════════════════════════════════════ */}
      <div className="px-6 sm:px-10 lg:px-16 pt-8 sm:pt-10">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">
          Engagement Letter
        </h2>
        <div className="border-t border-gray-200 mt-4" />
      </div>

      {/* FAQ Section */}
      <div className="px-6 sm:px-10 lg:px-16">
        <FAQAccordion items={faqItems} />
      </div>

      {/* ═══════════════════════════════════════
         SIGNATURE SECTION
      ═══════════════════════════════════════ */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="mx-6 sm:mx-10 lg:mx-16 mt-8 mb-6 bg-gray-50 rounded-xl p-5 sm:p-6 lg:p-8">
          <h3 className="text-base font-bold text-gray-900">
            Signature / Acceptance
          </h3>
          <p className="text-sm text-gray-500 mt-1 mb-6">
            I agree to retain iClosed to represent me in my real estate transaction under the terms outlined above.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

          {/* Signature preview */}
          {signature.trim() && (
            <div className="mt-5 pt-5 border-t border-dashed border-gray-200">
              <p className="text-xs text-gray-400 mb-1.5">Signature Preview</p>
              <p
                className="text-2xl text-gray-900 tracking-wide"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
              >
                {signature}
              </p>
            </div>
          )}
        </div>

        {/* Submit row */}
        <div className="px-6 sm:px-10 lg:px-16 pb-8 sm:pb-10 lg:pb-12 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-xs text-gray-400">
            Note: Please refer to our complete{" "}
            <a href="/privacy-policy" className="text-[#C10007] hover:underline">
              privacy policy
            </a>
            , for more details on terms of service, and user agreement.
          </p>
          <Button type="submit" size="md" loading={loading}>
            Submit
          </Button>
        </div>
      </form>
    </div>
  );
}
