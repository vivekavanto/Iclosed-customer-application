"use client";

import { useState, useEffect, FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileText, MapPin, Tag, ArrowRight } from "lucide-react";
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
      "We are iClosed, powered by Nava Wilson PC, an Ontario law firm focused exclusively on real estate transactions. We handle purchases, sales, refinances, and title transfers\u2014all through secure digital platforms, including video signing.",
  },
  {
    question: "Who is the lawyer or law firm representing me?",
    answer:
      "Your transaction will be handled by a licensed Ontario lawyer at Nava Wilson PC.",
  },
  {
    question: "What legal services are included in this retainer?",
    answer:
      "Our retainer covers the full scope of legal work needed to close your real estate transaction, including title search, document preparation, registration, and trust account management.",
  },
  {
    question: "How much will it cost?",
    answer:
      "At the start of the intake process, you should have received a fee quote that identifies the expected legal fees. If you have not received a quote, please contact our lawyers.",
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

function getTodayDateString(): string {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().split("T")[0];
}

/**
 * For a primary signer, return the label that describes their counterpart.
 * Purchase           → "Co-purchaser"
 * Sale               → "Co-seller"
 * Purchase & Sale    → "Co-purchaser / Co-seller"
 * Falls back to the more specific label when `side` is known on a P&S deal.
 */
function getCoPersonLabel(
  leadType: string,
  side: "purchase" | "sale" | null
): string {
  if (leadType === "Purchase & Sale") {
    if (side === "purchase") return "Co-purchaser";
    if (side === "sale") return "Co-seller";
    return "Co-purchaser / Co-seller";
  }
  if (leadType === "Sale") return "Co-seller";
  if (leadType === "Purchase") return "Co-purchaser";
  if (side === "sale") return "Co-seller";
  return "Co-purchaser";
}

/**
 * Modal shell for the post-sign result screens — same popup styling as the
 * "Want to help with your co-purchaser(s) paperwork?" prompt (backdrop + white
 * rounded card) with the shared green success check. Keeps every post-sign
 * screen on one consistent popup design.
 */
function ResultPopup({
  children,
  plain = false,
}: {
  children: ReactNode;
  /** When true, render as a plain centered page instead of a modal overlay —
   *  used after the user dismisses (OK) a terminal popup. */
  plain?: boolean;
}) {
  const card = (
    <div
      className={
        plain
          ? "text-center max-w-md w-full"
          : "bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full p-6 sm:p-8 text-center"
      }
    >
      <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-green-50 flex items-center justify-center">
        <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      {children}
    </div>
  );

  if (plain) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        {card}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      {card}
    </div>
  );
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
  const [date, setDate] = useState(getTodayDateString());
  const [signature, setSignature] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [purchaseAddress, setPurchaseAddress] = useState<string | null>(null);
  const [saleAddress, setSaleAddress] = useState<string | null>(null);
  const [leadType, setLeadType] = useState("");
  const [side, setSide] = useState<"purchase" | "sale" | null>(null);
  const [retainerCurrent, setRetainerCurrent] = useState(1);
  const [retainerTotal, setRetainerTotal] = useState(1);
  const [isCoPerson, setIsCoPerson] = useState(false);
  const [coPersonRole, setCoPersonRole] = useState<"purchaser" | "seller" | null>(
    null
  );
  // Local-only acknowledgement — not yet sent to the backend.
  const [coAuthAcknowledged, setCoAuthAcknowledged] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  // Whether every required retainer is already signed (nothing left to sign).
  const [allSigned, setAllSigned] = useState(false);
  // Gate the form until the check resolves so we never flash the blank
  // "Address not available" form before we know there's something to sign.
  const [checking, setChecking] = useState(true);
  // Account-free signing: when the page is opened from an emailed retainer link
  // it carries ?token=. In that mode the signer has no session, so after
  // signing we offer "Activate account / later" instead of redirecting to the
  // (login-gated) dashboard.
  const [token, setToken] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [postSignChoice, setPostSignChoice] = useState<"activated" | "later" | null>(null);
  // Whether the signer already has a portal account. The "Activate your
  // account" prompt is shown only to NEW clients; existing clients just log in.
  const [accountExists, setAccountExists] = useState(false);
  // Document-upload responsibility, resolved from the intake "who will upload
  // documents" choice (stored on the primary lead's upload_mode) and returned by
  // /api/retainer/sign. `isDocumentUploader` → this signer uploads in the portal
  // (the primary in "me", the chosen co-person in "co", everyone in "both").
  const [isDocumentUploader, setIsDocumentUploader] = useState(false);
  // The family's document-upload mode (from the primary lead). Used to detect a
  // "secondary" signer — a delegated mode ("me"/"co") where this signer is NOT
  // the uploader, so someone else handles their documents and they're done.
  const [uploadMode, setUploadMode] = useState<"me" | "co" | "both" | null>(null);
  // For a secondary signer, the name of the person handling their documents.
  const [uploaderName, setUploaderName] = useState<string | null>(null);
  // Whether the user dismissed (clicked OK on) a terminal post-sign popup, so
  // we drop the modal backdrop and leave a plain confirmation behind.
  const [postSignDismissed, setPostSignDismissed] = useState(false);
  // Account-free link that no longer resolves (expired, revoked, or the lead was
  // removed). Shown as a clear message instead of a blank, signable form.
  const [linkError, setLinkError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function prefill() {
      try {
        const tk = new URLSearchParams(window.location.search).get("token");
        setToken(tk);
        const res = await fetch(
          `/api/retainer/check${tk ? `?token=${encodeURIComponent(tk)}` : ""}`
        );
        const data = await res.json();
        // Account-free token link that no longer resolves (invalid/expired, or
        // the customer was removed). Show a clear message rather than a blank
        // form. Only in token mode — a logged-in 401 is a real expired session,
        // handled by the IdleLogoutGuard, so we leave it alone here.
        if (tk && (!res.ok || data?.error)) {
          setLinkError(
            data?.error || "This retainer link is invalid or has expired."
          );
          return;
        }
        // Nothing left to sign → show the "all signed" confirmation instead of
        // a blank, signable form. The check route returns { signed: true } when
        // every required retainer is already on file (or no converted deal
        // needs one yet), and in that case carries no address/name/type.
        if (data.signed === true && !data.error) {
          setAllSigned(true);
          return;
        }
        if (data.full_name) {
          setName(data.full_name);
          setSignature(data.full_name);
        }
        setDate(getTodayDateString());
        if (data.property_address) {
          setPropertyAddress(data.property_address);
        }
        setPurchaseAddress(data.purchase_address ?? null);
        setSaleAddress(data.sale_address ?? null);
        if (data.lead_type) {
          setLeadType(data.lead_type);
        }
        setSide(
          data.side === "purchase" || data.side === "sale" ? data.side : null
        );
        setRetainerCurrent(data.retainer_current ?? 1);
        setRetainerTotal(data.retainer_total ?? 1);
        setIsCoPerson(Boolean(data.is_co_person));
        setCoPersonRole(
          data.co_person_role === "purchaser" || data.co_person_role === "seller"
            ? data.co_person_role
            : null
        );
      } catch {
        // silently fail — user can fill manually
      } finally {
        setChecking(false);
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
          ...(token ? { token } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors({ name: data.error || "Something went wrong. Please try again." });
        return;
      }

      setAccountExists(Boolean(data.account_exists));
      setIsDocumentUploader(Boolean(data.is_document_uploader));
      setUploadMode(
        data.upload_mode === "me" ||
          data.upload_mode === "co" ||
          data.upload_mode === "both"
          ? data.upload_mode
          : null
      );
      setUploaderName(
        typeof data.uploader_name === "string" && data.uploader_name
          ? data.uploader_name
          : null
      );
      setSubmitted(true);
      // Logged-in signer → back to the dashboard. Account-free (token) signer →
      // stay on the success screen, which offers "Activate account / later".
      if (!token) {
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 2000);
      }
    } catch {
      setErrors({ name: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  // ── Post-sign account activation (account-free token flow only) ──
  const handleActivate = async () => {
    if (!token) return;
    setActivating(true);
    try {
      // The activate webhook returns a one-time `activate_url` (and also emails
      // the same link). Per the new flow, send the user straight to the
      // set-password page when we get that link; otherwise fall back to the
      // "check your email" screen so account creation still completes via email.
      const res = await fetch("/api/retainer/post-sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, choice: "activate" }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.activate_url) {
        window.location.href = data.activate_url as string;
        return;
      }
      setPostSignChoice("activated");
    } catch {
      setPostSignChoice("activated");
    } finally {
      setActivating(false);
    }
  };

  const handleLater = async () => {
    if (token) {
      try {
        const res = await fetch("/api/retainer/post-sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, choice: "later" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data?.email_sent) {
          // The signature is already saved, so we don't block the user — but log
          // the failure so a non-arriving activation email is diagnosable.
          console.error(
            "[Retainer] activation email not sent:",
            data?.error ?? "unknown error"
          );
        }
      } catch {
        // non-blocking — the signature is already saved
      }
    }
    setPostSignChoice("later");
  };

  // Auto-redirect account-holders (accountExists) who arrived via a token
  // after signing to the login page. The effect is declared unconditionally
  // at the component level and only triggers when the state matches.
  useEffect(() => {
    if (token && postSignChoice === null && accountExists) {
      const id = setTimeout(() => router.push("/login"), 2200);
      return () => clearTimeout(id);
    }
    return;
  }, [token, postSignChoice, accountExists, router]);

  /* Loading State — checking whether anything still needs signing */
  if (checking) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <span
          className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#C10007]"
          aria-hidden="true"
        />
      </div>
    );
  }

  /* Invalid / expired link State — account-free token no longer resolves */
  if (linkError) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-[#C10007]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Link no longer valid
          </h1>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            {linkError} Please contact your iClosed advisor to request a new
            retainer link.
          </p>
        </div>
      </div>
    );
  }

  /* All-Signed State — every required retainer is already on file */
  if (allSigned) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-green-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            All Retainers Signed
          </h1>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            You&apos;ve signed all of your retainer agreements. There&apos;s nothing left to sign here.
          </p>
          <Button size="md" onClick={() => router.push("/dashboard")}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  /* Success State */
  if (submitted) {
    // Account-free (token) signer: offer immediate account activation.
    if (token && postSignChoice === null) {
      // Document uploader (new account) — the person responsible for uploads for
      // this file (primary in "me", chosen co-person in "co", everyone in
      // "both"). They must activate their account to manage documents. In the
      // delegated modes we name the people they upload for; in "both" each
      // handles their own, so no names are listed.
      if (isDocumentUploader && !accountExists) {
        return (
          <ResultPopup>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              You&apos;re all set &mdash; your retainer is signed
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              Activate your iClosed account to upload your documents and track
              your transaction.
            </p>
            <div className="flex flex-col items-center gap-4">
              <Button size="md" onClick={handleActivate} loading={activating}>
                Activate your account
              </Button>
              <button
                type="button"
                onClick={handleLater}
                disabled={activating}
                className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700 disabled:opacity-50"
              >
                I&apos;ll do this later &mdash; email me an activation link
              </button>
            </div>
          </ResultPopup>
        );
      }
      // Secondary signer in a delegated mode — "me"/"co" where this signer is
      // NOT the uploader. Someone else (the primary in "me", the chosen
      // co-person in "co") handles their documents, so there's no account to set
      // up and nothing more to do. This covers the co-person in "me" mode AND
      // the passive primary in "co" mode. (If they later want their own access,
      // the admin invites them out-of-band.)
      if (
        (uploadMode === "me" || uploadMode === "co") &&
        !isDocumentUploader
      ) {
        const firstName = name.split(" ")[0] || "there";
        return (
          <ResultPopup>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              Thanks, {firstName} &mdash; your retainer is signed
            </h1>
            <p className="text-sm text-gray-500">
              A copy is on its way to your inbox.{" "}
              {uploaderName ? (
                <>
                  <span className="font-semibold text-gray-700">
                    {uploaderName}
                  </span>{" "}
                  is handling document submission for this file, so there&apos;s
                  nothing else you need to do right now.
                </>
              ) : (
                <>
                  The documents for this file are being handled for you, so
                  there&apos;s nothing else you need to do right now.
                </>
              )}
            </p>
            <div className="mt-6 flex justify-center">
              <Button size="md" onClick={() => window.close()}>Close tab</Button>
            </div>
          </ResultPopup>
        );
      }
      // Existing clients already have an account — no "Activate your account"
      // popup; they just log in to upload their documents and ID.
      if (accountExists) {
        return (
          <ResultPopup>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              Retainer Signed
            </h1>
            <p className="text-sm text-gray-500">
              Thanks, {name.split(" ")[0] || "there"}. Log in to your account to
              upload your documents and ID.
            </p>
            <div className="mt-6 flex justify-center">
              <Button size="md" onClick={() => router.push("/login")}>Log in</Button>
            </div>
          </ResultPopup>
        );
      }
      // A co-person (co-purchaser/co-seller) with no account never sees the
      // "Activate your account" popup. They reach here only when the primary
      // chose "Me" — the primary uploads everything on their behalf, so the
      // co-person has no account to set up and nothing more to do. (Co-persons
      // who DO need their own account — "Both" / "My co-purchaser" — were invited
      // by email and hit the `accountExists` branch above instead.)
      if (isCoPerson) {
        return (
          <ResultPopup>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              Retainer Signed
            </h1>
            <p className="text-sm text-gray-500">
              Thank you for signing, {name.split(" ")[0] || "there"}. There&apos;s
              nothing more you need to do — your co-applicant is handling the
              document uploads, and our team will be in touch.
            </p>
          </ResultPopup>
        );
      }
      return (
        <ResultPopup>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Retainer Signed
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Thanks, {name.split(" ")[0] || "there"}. Activate your account now to
            upload your documents and ID — or do it later.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="md" onClick={handleActivate} loading={activating}>
              Activate your account
            </Button>
            <Button size="md" variant="secondary" onClick={handleLater} disabled={activating}>
              I&apos;ll do this later
            </Button>
          </div>
        </ResultPopup>
      );
    }

    // "I'll do this later" acknowledgement. Dismissable via OK — clicking it
    // drops the modal backdrop and leaves a plain confirmation.
    if (token && postSignChoice === "later") {
      return (
        <ResultPopup plain={postSignDismissed}>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Retainer Signed
          </h1>
          <p className="text-sm text-gray-500">
            Thank you for signing. We&apos;ve emailed you a link to activate your
            account whenever you&apos;re ready to upload your documents.
          </p>
          {!postSignDismissed && (
            <div className="mt-6 flex justify-center">
              <Button size="md" onClick={() => setPostSignDismissed(true)}>
                OK
              </Button>
            </div>
          )}
        </ResultPopup>
      );
    }

    // After "Yes, continue": we emailed the activation link rather than
    // redirecting into /set-password, so the user creates their account from
    // that email.
    if (token && postSignChoice === "activated") {
      return (
        <ResultPopup plain={postSignDismissed}>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Check your email
          </h1>
          <p className="text-sm text-gray-500">
            We&apos;ve sent you an email to activate your account. Use the link
            in it to create your account and set your password.
          </p>
          {!postSignDismissed && (
            <div className="mt-6 flex justify-center">
              <Button size="md" onClick={() => setPostSignDismissed(true)}>
                OK
              </Button>
            </div>
          )}
        </ResultPopup>
      );
    }

    // Logged-in signer (no token) — confirmation + auto-redirect to the dashboard.
    return (
      <ResultPopup>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
          Agreement Submitted
        </h1>
        <p className="text-sm text-gray-500">
          Thank you for signing the retainer agreement. Our team will review and be in touch shortly.
        </p>
      </ResultPopup>
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
          {/* Combined P&S retainer — show both addresses with labels */}
          {purchaseAddress && saleAddress ? (
            <div className="mt-2 space-y-1">
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-700">Purchase Property:</span>{" "}
                {purchaseAddress}
              </p>
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-700">Sale Property:</span>{" "}
                {saleAddress}
              </p>
            </div>
          ) : (
            <>
              {side && (
                <p className="text-sm font-semibold text-[#C10007] mt-2">
                  {side === "purchase" ? "Purchase Property" : "Sale Property"}
                </p>
              )}
              <p className="text-sm text-gray-500 mt-2">
                {propertyAddress || "Address not available"}
              </p>
            </>
          )}
          <p className="text-sm text-gray-400 mt-0.5">
            Transaction Type: {leadType || "N/A"}
          </p>
        </div>
        {retainerTotal >= 2 && (
          <span className="flex-shrink-0 w-11 h-11 rounded-full border-2 border-[#C10007] flex items-center justify-center text-sm font-bold text-[#C10007]">
            {retainerCurrent}/{retainerTotal}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="mx-6 sm:mx-10 lg:mx-16 border-t border-gray-200" />

      {/* ═══════════════════════════════════════
         ENGAGEMENT LETTER
      ═══════════════════════════════════════ */}
      {/* <div className="px-6 sm:px-10 lg:px-16 pt-8 sm:pt-10">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">
          Engagement Letter
        </h2>
        <div className="border-t border-gray-200 mt-4" />
      </div> */}

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                disabled
                aria-readonly="true"
                className={[
                  "w-full px-4 py-2.5 rounded-sm border text-sm transition-colors duration-150",
                  "bg-[var(--color-surface)] text-[var(--color-text-heading)]",
                  "placeholder:text-[var(--color-text-muted)]",
                  "cursor-not-allowed",
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
              label="Full name"
              hint="(Signature)"
              required
              placeholder="Your full name"
              value={signature}
              readOnly
              disabled
              aria-readonly="true"
              className="cursor-not-allowed"
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

          {/* ─── Co-person authorization acknowledgement ─────────────────
             Optional checkbox. We collect the answer locally but do not
             send it to the backend yet — that wiring will land later.
             Currently hidden from the frontend. */}
          {false && (
          <div className="mt-5 pt-5 border-t border-dashed border-gray-200">
            <label
              htmlFor="retainer-co-auth"
              className="flex items-start gap-3 cursor-pointer group"
            >
              <input
                id="retainer-co-auth"
                type="checkbox"
                checked={coAuthAcknowledged}
                onChange={(e) => setCoAuthAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-[#C10007] focus:ring-2 focus:ring-[#C10007]/40 cursor-pointer"
              />
              <span className="text-sm leading-relaxed text-gray-700">
                {isCoPerson ? (
                  <>
                    I would like to give the primary the authority to submit
                    personal information and identification on my behalf.
                  </>
                ) : (
                  <>
                    I would like to submit Personal Information and
                    Identification on behalf of my{" "}
                    <span className="font-semibold text-gray-900">
                      {getCoPersonLabel(leadType, side)}
                    </span>
                    .
                  </>
                )}
              </span>
            </label>
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
            I agree
          </Button>
        </div>
      </form>
    </div>
  );
}
