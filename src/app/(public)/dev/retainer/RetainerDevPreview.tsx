"use client";

import { useMemo, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FAQAccordion, { FAQItem } from "@/components/retainer/FAQAccordion";
import RetainerPermissionFlow from "@/components/retainer/RetainerPermissionFlow";
import RetainerUploadPermissionCheckbox from "@/components/retainer/RetainerUploadPermissionCheckbox";
import RetainerAccountSetupPrompt from "@/components/retainer/RetainerAccountSetupPrompt";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import {
  DEV_SCENARIOS,
  DevScenario,
  getScenario,
} from "./mockScenarios";

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

function getTodayDateString(): string {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().split("T")[0];
}

function getCoPersonLabel(
  leadType: string,
  side: "purchase" | "sale" | null
): string {
  if (leadType === "Purchase & Sale") {
    if (side === "purchase") return "Co-purchaser(s)";
    if (side === "sale") return "Co-seller(s)";
    return "Co-purchaser(s) / Co-seller(s)";
  }
  if (leadType === "Sale") return "Co-seller(s)";
  if (leadType === "Purchase") return "Co-purchaser(s)";
  if (side === "sale") return "Co-seller(s)";
  return "Co-purchaser(s)";
}

function getPrimaryCoPersonLabel(
  leadType: string,
  side: "purchase" | "sale" | null,
  hasCoPurchaser: boolean,
  hasCoSeller: boolean
): string {
  if (leadType === "Purchase & Sale") {
    if (hasCoPurchaser && hasCoSeller) return "Co-purchaser(s) / Co-seller(s)";
    if (hasCoPurchaser) return "Co-purchaser(s)";
    if (hasCoSeller) return "Co-seller(s)";
  }
  return getCoPersonLabel(leadType, side);
}

function DevToolbar({
  scenario,
  onScenarioChange,
  onReset,
  onSkipToPermission,
  showSkipToPermission,
}: {
  scenario: DevScenario;
  onScenarioChange: (id: string) => void;
  onReset: () => void;
  onSkipToPermission: () => void;
  showSkipToPermission: boolean;
}) {
  return (
    <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Dev preview — not connected to auth or APIs
          </p>
          <p className="mt-0.5 text-sm text-amber-900">{scenario.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="dev-scenario">
            Scenario
          </label>
          <select
            id="dev-scenario"
            value={scenario.id}
            onChange={(e) => onScenarioChange(e.target.value)}
            className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            {DEV_SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={onReset}>
            Reset flow
          </Button>
          {(scenario.isCoPerson || scenario.hasCoPersons) && showSkipToPermission && (
            <Button size="sm" variant="secondary" onClick={onSkipToPermission}>
              Skip to permission flow
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RetainerDevPreview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scenarioId = searchParams.get("scenario");
  const scenario = useMemo(() => getScenario(scenarioId), [scenarioId]);

  const [flowKey, setFlowKey] = useState(0);
  const [date] = useState(getTodayDateString());
  const [errors, setErrors] = useState<{ signature?: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [showPermissionFlow, setShowPermissionFlow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [permissionFlowKey, setPermissionFlowKey] = useState(0);
  const [permissionInitialStep, setPermissionInitialStep] =
    useState<"confirm-retainer" | "permission-choice">("confirm-retainer");
  const [uploadPermissionGranted, setUploadPermissionGranted] = useState(false);
  const [showAccountSetup, setShowAccountSetup] = useState(false);

  const signature = scenario.fullName;
  const showInlinePermission =
    Boolean(scenario.useInlinePermission) &&
    (scenario.isCoPerson || scenario.hasCoPersons);
  const showModalPermission =
    !scenario.useInlinePermission &&
    (scenario.isCoPerson || scenario.hasCoPersons);
  const coPersonLabel = getPrimaryCoPersonLabel(
    scenario.leadType,
    scenario.side,
    scenario.hasCoPurchaser,
    scenario.hasCoSeller
  );

  const changeScenario = (id: string) => {
    router.replace(`/dev/retainer?scenario=${id}`);
    setFlowKey((k) => k + 1);
    setSubmitted(false);
    setShowPermissionFlow(false);
    setErrors({});
    setLastAction(null);
    setUploadPermissionGranted(false);
    setShowAccountSetup(false);
  };

  const resetFlow = () => {
    setFlowKey((k) => k + 1);
    setSubmitted(false);
    setShowPermissionFlow(false);
    setShowAccountSetup(false);
    setErrors({});
    setLastAction(null);
    setPermissionFlowKey((k) => k + 1);
    setPermissionInitialStep("confirm-retainer");
    setUploadPermissionGranted(false);
  };

  const openPermissionFlow = (skipToChoice = false) => {
    setPermissionInitialStep(skipToChoice ? "permission-choice" : "confirm-retainer");
    setPermissionFlowKey((k) => k + 1);
    setShowPermissionFlow(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!signature.trim()) {
      setErrors({ signature: "Signature is required" });
      return;
    }
    setErrors({});
    setLoading(true);
    setLastAction("Simulating retainer sign…");

    await new Promise((resolve) => setTimeout(resolve, 600));

    setLoading(false);

    if (showInlinePermission) {
      setLastAction(
        uploadPermissionGranted
          ? "Retainer signed (mock). Upload permission: granted."
          : "Retainer signed (mock). Upload permission: not granted — each person uploads their own."
      );
      setShowAccountSetup(true);
      return;
    }

    setLastAction("Retainer signed (mock — nothing saved)");

    if (showModalPermission) {
      openPermissionFlow(false);
    } else {
      setSubmitted(true);
    }
  };

  const finishFlow = () => {
    setShowPermissionFlow(false);
    setSubmitted(true);
    setLastAction("Permission flow completed (mock — nothing saved)");
  };

  const handleCreateAccount = () => {
    setShowAccountSetup(false);
    setLastAction("Redirecting to set password (mock)");
    window.location.href = "/set-password";
  };

  const handleDeferAccount = () => {
    setShowAccountSetup(false);
    setSubmitted(true);
    setLastAction("Account setup deferred (mock — would allow dashboard later via email link)");
  };

  if (submitted) {
    return (
      <div key={flowKey} className="min-h-screen bg-white">
        <DevToolbar
          scenario={scenario}
          onScenarioChange={changeScenario}
          onReset={resetFlow}
          onSkipToPermission={() => openPermissionFlow(true)}
          showSkipToPermission={showModalPermission}
        />
        <div className="flex min-h-[calc(100vh-80px)] items-center justify-center px-6">
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <svg
                className="h-8 w-8 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-bold text-gray-900 sm:text-2xl">
              Agreement Submitted
            </h1>
            <p className="mx-auto mb-6 max-w-md text-sm text-gray-500">
              Mock success state — in production this would redirect to the
              dashboard.
            </p>
            {lastAction && (
              <p className="mb-6 text-xs text-amber-700">{lastAction}</p>
            )}
            <Button size="md" onClick={resetFlow}>
              Test again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div key={flowKey} className="min-h-screen bg-white">
      <DevToolbar
        scenario={scenario}
        onScenarioChange={changeScenario}
        onReset={resetFlow}
        onSkipToPermission={() => openPermissionFlow(true)}
        showSkipToPermission={showModalPermission}
      />

      {lastAction && (
        <div className="border-b border-amber-100 bg-amber-50/50 px-6 py-2 text-center text-xs text-amber-800">
          {lastAction}
        </div>
      )}

      <div className="flex items-start justify-between px-6 py-8 sm:px-10 sm:py-10 lg:px-16 lg:py-12">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Retainer Agreement
          </h1>
          {scenario.purchaseAddress && scenario.saleAddress ? (
            <div className="mt-2 space-y-1">
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-700">
                  Purchase Property:
                </span>{" "}
                {scenario.purchaseAddress}
              </p>
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-700">
                  Sale Property:
                </span>{" "}
                {scenario.saleAddress}
              </p>
            </div>
          ) : (
            <>
              {scenario.side && (
                <p className="mt-2 text-sm font-semibold text-[#C10007]">
                  {scenario.side === "purchase"
                    ? "Purchase Property"
                    : "Sale Property"}
                </p>
              )}
              <p className="mt-2 text-sm text-gray-500">
                {scenario.propertyAddress ?? "Address not available"}
              </p>
            </>
          )}
          <p className="mt-0.5 text-sm text-gray-400">
            Transaction Type: {scenario.leadType}
          </p>
        </div>
        {scenario.retainerTotal >= 2 && (
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#C10007] text-sm font-bold text-[#C10007]">
            {scenario.retainerCurrent}/{scenario.retainerTotal}
          </span>
        )}
      </div>

      <div className="mx-6 border-t border-gray-200 sm:mx-10 lg:mx-16" />

      <div className="px-6 sm:px-10 lg:px-16">
        <FAQAccordion items={faqItems} />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="mx-6 mb-6 mt-8 rounded-xl bg-gray-50 p-5 sm:mx-10 sm:p-6 lg:mx-16 lg:p-8">
          <h3 className="text-base font-bold text-gray-900">
            Signature / Acceptance
          </h3>
          <p className="mb-6 mt-1 text-sm text-gray-500">
            I agree to retain iClosed to represent me in my real estate
            transaction under the terms outlined above.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex w-full flex-col gap-1.5">
              <label
                htmlFor="retainer-date"
                className="text-sm font-medium text-[var(--color-text-heading)]"
              >
                Choose Date<span className="ml-1 text-red-600">*</span>
              </label>
              <input
                id="retainer-date"
                type="date"
                value={date}
                disabled
                aria-readonly="true"
                className="w-full cursor-not-allowed rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text-heading)]"
              />
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

          {signature.trim() && (
            <div className="mt-5 border-t border-dashed border-gray-200 pt-5">
              <p className="mb-1.5 text-xs text-gray-400">Signature Preview</p>
              <p
                className="text-2xl tracking-wide text-gray-900"
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontStyle: "italic",
                }}
              >
                {signature}
              </p>
            </div>
          )}

          {showInlinePermission && (
            <RetainerUploadPermissionCheckbox
              checked={uploadPermissionGranted}
              onChange={setUploadPermissionGranted}
              isCoPerson={scenario.isCoPerson}
              otherPersonName={scenario.primaryFirstName}
              coPersonLabel={coPersonLabel}
            />
          )}
        </div>

        <div className="flex flex-col-reverse gap-4 px-6 pb-8 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:pb-10 lg:px-16 lg:pb-12">
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

      {showModalPermission && (
        <RetainerPermissionFlow
          key={permissionFlowKey}
          open={showPermissionFlow}
          onComplete={finishFlow}
          userName={scenario.fullName}
          isCoPerson={scenario.isCoPerson}
          primaryFirstName={scenario.primaryFirstName}
          coPersonLabel={coPersonLabel}
          initialStep={permissionInitialStep}
        />
      )}

      {showInlinePermission && (
        <RetainerAccountSetupPrompt
          open={showAccountSetup}
          userName={scenario.fullName}
          onCreateAccount={handleCreateAccount}
          onDefer={handleDeferAccount}
        />
      )}
    </div>
  );
}
