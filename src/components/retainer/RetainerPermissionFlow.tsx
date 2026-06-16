"use client";

import { useState } from "react";
import { Check, Info } from "lucide-react";
import Button from "@/components/ui/Button";

type FlowStep =
  | "confirm-retainer"
  | "permission-choice"
  | "account-setup"
  | "success-granted"
  | "success-declined"
  | "success-self-upload";

interface RetainerPermissionFlowProps {
  open: boolean;
  onComplete: () => void;
  userName: string;
  isCoPerson: boolean;
  /** Lead client's first name — shown to co-persons in plain language (not "primary applicant"). */
  primaryFirstName?: string;
  coPersonLabel: string;
  /** Dev/testing — start on a specific step instead of confirm-retainer. */
  initialStep?: FlowStep;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function StepProgress({
  current,
  label,
}: {
  current: 1 | 2;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <div className="flex gap-1">
        <div
          className={`h-1 w-10 rounded-full ${
            current >= 1 ? "bg-[#C10007]" : "bg-gray-200"
          }`}
        />
        <div
          className={`h-1 w-10 rounded-full ${
            current >= 2 ? "bg-[#C10007]" : "bg-gray-200"
          }`}
        />
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        Step {current} of 2 · {label}
      </p>
    </div>
  );
}

export default function RetainerPermissionFlow({
  open,
  onComplete,
  userName,
  isCoPerson,
  primaryFirstName = "your co-client",
  coPersonLabel,
  initialStep = "confirm-retainer",
}: RetainerPermissionFlowProps) {
  const [step, setStep] = useState<FlowStep>(initialStep);

  if (!open) return null;

  const userInitials = getInitials(userName);
  const primaryInitials = getInitials(primaryFirstName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100/95 p-4 overflow-y-auto">
      <div className="w-full max-w-lg">
        {/* Step 1 — Signed confirmation before permission choice */}
        {step === "confirm-retainer" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-8 py-10">
            <StepProgress current={1} label="Confirmation" />
            <div className="mb-4 flex items-center gap-3 pb-4 border-b border-gray-100">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-50">
                <Check className="h-5 w-5 text-green-600" strokeWidth={2.5} />
              </div>
              <div className="text-left">
                <h2 className="text-xl font-bold text-gray-900">
                  Retainer signed
                </h2>
                <p className="text-sm text-gray-500">{userName}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-8">
              {isCoPerson ? (
                <>
                  Thanks, {getFirstName(userName)}. Your agreement is on file.
                  One last step — choose whether {primaryFirstName} can upload
                  documents on your behalf.
                </>
              ) : (
                <>
                  Thanks, {getFirstName(userName)}. Your agreement is on file.
                  One last step — choose who can upload documents for your{" "}
                  {coPersonLabel.toLowerCase()}.
                </>
              )}
            </p>
            <div className="flex justify-end">
              <Button
                size="md"
                onClick={() => setStep("permission-choice")}
                className="rounded-full px-6"
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 — Permission choice */}
        {step === "permission-choice" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-8 py-10">
            <StepProgress
              current={2}
              label={isCoPerson ? "Almost done" : "Document permissions"}
            />

            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600 mb-4">
                {isCoPerson ? primaryInitials : userInitials}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                {isCoPerson
                  ? `Want ${primaryFirstName} to help with the paperwork?`
                  : `Want to help with your ${coPersonLabel.toLowerCase()}'s paperwork?`}
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed max-w-md">
                {isCoPerson ? (
                  <>
                    You and {primaryFirstName} are both clients on this
                    transaction. You may authorize {primaryFirstName} to upload
                    documents and identification on your behalf, or you may
                    handle your own uploads.
                  </>
                ) : (
                  <>
                    You may upload documents and identification on behalf of
                    your {coPersonLabel.toLowerCase()}, or they can manage their
                    own uploads through their own account.
                  </>
                )}
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50/80 overflow-hidden mb-6">
              {isCoPerson ? (
                <div className="px-5 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-green-700 mb-3">
                    If you grant access to {primaryFirstName}
                  </p>
                  <div className="flex items-start gap-2.5 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>
                      {primaryFirstName} can upload your ID &amp; verification
                      documents for this transaction
                    </span>
                  </div>
                  <p className="mt-3 border-t border-gray-100 pt-3 text-xs leading-relaxed text-gray-500">
                    You will still sign your own retainer and manage your own
                    personal and contact information through your account.
                  </p>
                </div>
              ) : (
                <div className="px-5 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-green-700 mb-3">
                    If you upload on their behalf
                  </p>
                  <div className="flex items-start gap-2.5 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>
                      You can upload ID &amp; verification documents for your{" "}
                      {coPersonLabel.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-3 border-t border-gray-100 pt-3 text-xs leading-relaxed text-gray-500">
                    Your {coPersonLabel.toLowerCase()} will still sign their own
                    retainer and manage their own personal and contact
                    information through their account.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <Button
                size="md"
                fullWidth
                onClick={() => setStep("success-granted")}
                className="rounded-full"
              >
                {isCoPerson
                  ? `Yes, grant access to ${primaryFirstName}`
                  : `Yes, I'll upload on their behalf`}
              </Button>
              <Button
                size="md"
                variant="secondary"
                fullWidth
                onClick={() =>
                  isCoPerson
                    ? setStep("account-setup")
                    : setStep("success-declined")
                }
                className="rounded-full bg-white"
              >
                {isCoPerson
                  ? "No thanks, I'll upload myself"
                  : "No, they will upload themselves"}
              </Button>
            </div>

            {isCoPerson && (
              <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-4 py-3 text-xs text-black font-semibold leading-relaxed">
                <Info className="w-6 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <p>
                  Prefer to upload yourself? You&apos;ll create your own iClosed
                  account to access the dashboard and manage your documents and
                  tasks.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Co-person only — account setup when declining primary help */}
        {step === "account-setup" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-8 py-10">
            <StepProgress current={2} label="One thing to confirm" />

            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600 mb-4">
                {userInitials}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                First, you&apos;ll create your own account
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed max-w-md">
                To upload documents and ID yourself, you&apos;ll need your own
                iClosed account — that&apos;s how you&apos;ll reach your
                dashboard to upload files and complete tasks. {primaryFirstName}{" "}
                won&apos;t be able to upload anything on your behalf.
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-5 py-4 mb-6">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-green-700 mb-3">
                With your own account you can
              </p>
              <div className="space-y-2.5">
                {[
                  "Set up a secure login with your email",
                  "Access your personal closing dashboard",
                  "Upload & manage your own documents and tasks",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-2.5 text-sm text-gray-700"
                  >
                    <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="md"
                fullWidth
                onClick={() => setStep("success-self-upload")}
                className="rounded-full"
              >
                Yes, create my account
              </Button>
              <Button
                size="md"
                variant="secondary"
                fullWidth
                onClick={() => setStep("permission-choice")}
                className="rounded-full bg-white"
              >
                Go back
              </Button>
            </div>
          </div>
        )}

        {/* Success — permission granted */}
        {step === "success-granted" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-8 py-12 text-center">
            <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-green-50 flex items-center justify-center">
              <Check className="w-7 h-7 text-green-500" strokeWidth={2.5} />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
              You&apos;re all set
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto mb-8">
              {isCoPerson ? (
                <>
                  {primaryFirstName} can now upload documents and ID on your
                  behalf. Please contact us at iclosed@navawilson.law if you would like to change this.
                </>
              ) : (
                <>
                  You can now upload documents and ID on behalf of your{" "}
                  {coPersonLabel.toLowerCase()}. They can still manage their own
                  account if they prefer.
                </>
              )}
            </p>
            <Button size="md" onClick={onComplete} className="rounded-full px-8">
              Continue
            </Button>
          </div>
        )}

        {/* Success — primary declined to submit on behalf */}
        {step === "success-declined" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-8 py-12 text-center">
            <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-gray-50 flex items-center justify-center">
              <Check className="w-7 h-7 text-gray-400" strokeWidth={2.5} />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
              Got it
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto mb-8">
              You won&apos;t submit documents on behalf of your{" "}
              {coPersonLabel.toLowerCase()}. They&apos;ll manage their own
              uploads through their iClosed account.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="md" onClick={onComplete} className="rounded-full px-8">
                Continue
              </Button>
              <Button
                size="md"
                variant="secondary"
                onClick={() => setStep("permission-choice")}
                className="rounded-full px-8 bg-white"
              >
                No, Go Back
              </Button>
            </div>
          </div>
        )}

        {/* Success — co-person chose self-upload / account path */}
        {step === "success-self-upload" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-8 py-12 text-center">
            <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-green-50 flex items-center justify-center">
              <Check className="w-7 h-7 text-green-500" strokeWidth={2.5} />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
              You&apos;re all set
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto mb-8">
              {primaryFirstName} won&apos;t upload on your behalf. Check your
              email for a link to set up your iClosed login and access your
              dashboard.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="md"
                onClick={() => {
                  window.location.href = "/set-password";
                }}
                className="rounded-full px-8"
              >
                Set up my login
              </Button>
              <Button
                size="md"
                variant="secondary"
                onClick={onComplete}
                className="rounded-full px-8 bg-white"
              >
                Continue without account
              </Button>
              <Button
                size="md"
                variant="secondary"
                onClick={() => setStep("permission-choice")}
                className="rounded-full px-8 bg-white"
              >
                Actually, grant access to {primaryFirstName}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
