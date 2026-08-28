"use client";

import React, { useState, useCallback } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  INTAKE_STEPS,
  STEP_SERVICE,
  STEP_PRICE_ADDRESS,
} from "@/components/intake/steps";
import {
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  Home,
  Tag,
  FileText,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  countExtractedValues,
  hasAnyExtractedValue,
  type ApsExtractionState,
  type ApsSide,
} from "@/lib/apsExtraction";
import type { ApsPartyMismatch } from "@/app/intake/page";

/** Human label for the role the client should hold on an agreement. */
const roleLabel = (role: "purchaser" | "seller") =>
  role === "purchaser" ? "purchaser" : "seller";

/**
 * The agreement names other people, but not the signed-in client.
 *
 * Loud and blocking on purpose: every downstream step — the prices, the
 * co-purchaser cards, the parties we open the file for — is derived from this
 * document, so accepting one that belongs to a different buyer would build the
 * whole file around the wrong person.
 */
const PartyMismatchNotice: React.FC<{ mismatch: ApsPartyMismatch }> = ({ mismatch }) => (
  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
    <p className="flex items-start gap-2 text-xs font-semibold text-red-800">
      <AlertCircle size={14} className="mt-px flex-shrink-0" />
      This agreement doesn&apos;t name you as the {roleLabel(mismatch.role)}.
    </p>
    <div className="mt-2 pl-6 text-xs leading-relaxed text-red-700">
      {mismatch.onOppositeSide ? (
        <p>
          You&apos;re named on this agreement, but as the{" "}
          {mismatch.role === "purchaser" ? "seller" : "purchaser"} — not the{" "}
          {roleLabel(mismatch.role)}. Please check you&apos;ve uploaded it under the
          right property.
        </p>
      ) : (
        <p>
          You&apos;re signed in as <strong>{mismatch.selfName}</strong>, and the{" "}
          {mismatch.role === "purchaser" ? "buyers" : "sellers"} on this document are{" "}
          <strong>{mismatch.names.join(", ")}</strong>.
        </p>
      )}
      <p className="mt-1.5">
        Remove the file and upload your own agreement. If the name on the agreement
        is spelled differently from your account, contact us and we&apos;ll sort it
        out.
      </p>
    </div>
  </div>
);

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const MAX_SIZE = 10 * 1024 * 1024;

function validateFile(f: File): string | null {
  const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return "Only PDF, JPG, and PNG files are allowed.";
  }
  if (f.size > MAX_SIZE) {
    return "File size must not exceed 10 MB.";
  }
  return null;
}

type YesNo = "yes" | "no" | null;
type Side = "purchase" | "sale";

interface ApsBlockProps {
  side: Side;
  signed: YesNo;
  setSigned: (v: "yes" | "no") => void;
  files: File[];
  setFiles: (f: File[]) => void;
  /** Fired for the files that passed validation, so the page can upload and read them. */
  onFilesAdded?: (side: Side, files: File[]) => void;
  onFileRemoved?: (side: Side, file: File) => void;
  /** Upload / read progress for this side. */
  extraction?: ApsExtractionState;
  /** Read the already-uploaded agreement again. Offered after a failed read. */
  onRetryRead?: (side: Side) => void;
  /** Set when the read succeeded but didn't name the signed-in client. */
  partyMismatch?: ApsPartyMismatch | null;
  // Show the per-side "APS for Purchasing/Sale Property" label beside the
  // toggle. Only needed in "both" mode to tell the two blocks apart — in a
  // single-side flow it just repeats the page heading, so it's hidden.
  showHeading: boolean;
}

const ApsBlock: React.FC<ApsBlockProps> = ({
  side,
  signed,
  setSigned,
  files,
  setFiles,
  onFilesAdded,
  onFileRemoved,
  extraction,
  onRetryRead,
  partyMismatch,
  showHeading,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const { error: toastError } = useToast();

  const inputId = `aps-file-${side}`;
  const heading =
    side === "purchase"
      ? "APS for Purchasing Property"
      : "APS for Sale Property";
  const helper =
    side === "purchase"
      ? "For the property you're buying"
      : "For the property you're selling";

  // Accept multiple files: validate each and APPEND the valid ones so the
  // client can upload the agreement plus amendments/waivers.
  const handlePickFiles = useCallback(
    (picked: FileList | File[]) => {
      const valid: File[] = [];
      for (const f of Array.from(picked)) {
        const err = validateFile(f);
        if (err) {
          toastError(`"${f.name}" — ${err}`);
          continue;
        }
        valid.push(f);
      }
      if (valid.length > 0) {
        setFiles([...files, ...valid]);
        // Upload + read happen on the page, which owns the draft id and the
        // form state the read prefills.
        onFilesAdded?.(side, valid);
      }
    },
    [files, setFiles, toastError, onFilesAdded, side]
  );

  const removeFile = useCallback(
    (index: number) => {
      const removed = files[index];
      setFiles(files.filter((_, i) => i !== index));
      if (removed) onFileRemoved?.(side, removed);
    },
    [files, setFiles, onFileRemoved, side]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files?.length) handlePickFiles(e.dataTransfer.files);
    },
    [handlePickFiles]
  );

  const segClass = (active: boolean) =>
    `flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${
      active
        ? "bg-white text-[#C10007] shadow-sm"
        : "text-gray-600 hover:text-gray-900"
    }`;

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-4 ${showHeading ? "justify-between" : ""}`}>
        {showHeading && (
          <div>
            <h3 className="text-base font-semibold text-gray-900">{heading}</h3>
            <p className="mt-0.5 text-gray-500 text-xs">{helper}</p>
          </div>
        )}
        <div
          role="radiogroup"
          aria-label={heading}
          className="inline-flex items-center bg-gray-100 rounded-lg p-1 w-44 flex-shrink-0"
        >
          <button
            type="button"
            role="radio"
            aria-checked={signed === "yes"}
            onClick={() => setSigned("yes")}
            className={segClass(signed === "yes")}
          >
            Yes
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={signed === "no"}
            onClick={() => setSigned("no")}
            className={segClass(signed === "no")}
          >
            No
          </button>
        </div>
      </div>

      {signed === "yes" && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">
              Upload signed agreement & supporting documents
            </p>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase tracking-wide">
              Optional
            </span>
          </div>

          <div
            className={`border border-dashed rounded-lg p-5 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              isDragging
                ? "border-[#C10007] bg-red-50/50"
                : "border-gray-300 bg-gray-50/50 hover:border-[#C10007] hover:bg-white"
            }`}
            onClick={() => document.getElementById(inputId)?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <UploadCloud size={20} className="text-gray-400 mb-1.5" />
            <p className="text-gray-600 text-sm text-center">
              <span className="text-[#C10007] font-medium">Click to browse</span> or drag & drop
            </p>
            <p className="text-gray-400 text-xs mt-0.5">
              {files.length > 0 ? "Add more files · " : ""}PDF, JPG, PNG — max 10 MB each
            </p>
            <input
              id={inputId}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handlePickFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2 mt-3">
              {files.map((f, idx) => (
                <div
                  key={`${f.name}-${idx}`}
                  className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-3 py-2"
                >
                  <p className="text-green-700 text-xs font-medium truncate">
                    ✓ {f.name}{" "}
                    <span className="text-green-600/70 font-normal">({formatBytes(f.size)})</span>
                  </p>
                  <button
                    onClick={() => removeFile(idx)}
                    className="text-xs text-gray-400 hover:text-red-500 ml-3 flex-shrink-0 cursor-pointer transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Read status. A slow, still-running or failed read never blocks
              Continue — the next steps just come up blank and the client fills
              them in as they always have. The ONE blocking outcome is a read
              that succeeded and named someone else: see PartyMismatchNotice. */}
          {extraction && extraction.status !== "idle" && (
            <div className="mt-3">
              {(extraction.status === "uploading" || extraction.status === "reading") && (
                <p className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 size={13} className="animate-spin text-[#C10007]" />
                  {extraction.status === "uploading"
                    ? "Uploading your agreement…"
                    : "Reading your agreement — you can continue while we do."}
                </p>
              )}

              {extraction.status === "error" && (
                <p className="flex items-start gap-2 text-xs text-gray-500">
                  <AlertCircle size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <span>
                    {extraction.error}
                    {/* The file is already uploaded, so another go costs the
                        client nothing but the wait — and a read that ran out of
                        time on a long scan usually lands on the second pass. */}
                    {onRetryRead && (
                      <>
                        {" "}
                        <button
                          type="button"
                          onClick={() => onRetryRead(side)}
                          className="underline underline-offset-2 text-[#C10007] hover:text-[#a00006]"
                        >
                          Try reading it again
                        </button>
                      </>
                    )}
                  </span>
                </p>
              )}

              {extraction.status === "done" && extraction.result && (
                <>
                  {partyMismatch ? (
                    <PartyMismatchNotice mismatch={partyMismatch} />
                  ) : !extraction.result.is_aps ? (
                    <p className="flex items-start gap-2 text-xs text-gray-500">
                      <AlertCircle size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                      That doesn&apos;t look like an Agreement of Purchase and Sale, so we
                      haven&apos;t filled anything in. We&apos;ve kept the file with your
                      submission.
                    </p>
                  ) : hasAnyExtractedValue(extraction.result) ? (
                    <p className="flex items-start gap-2 text-xs text-green-700">
                      <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" />
                      We read {countExtractedValues(extraction.result)} details from your
                      agreement. They&apos;re filled in on the next steps — please check
                      them before you submit.
                    </p>
                  ) : (
                    <p className="flex items-start gap-2 text-xs text-gray-500">
                      <AlertCircle size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                      We couldn&apos;t pull any details out of that file. You can enter them
                      yourself on the next step.
                    </p>
                  )}
                </>
              )}

              {files.length > 1 && (
                <p className="mt-1.5 text-[11px] text-gray-400">
                  We read the first file only. Amendments and schedules are stored with
                  your file for our team to review.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface Step4Props {
  closingOption: "buying" | "selling" | "both" | null;
  apsPurchaseSigned: YesNo;
  setApsPurchaseSigned: (v: "yes" | "no") => void;
  apsSaleSigned: YesNo;
  setApsSaleSigned: (v: "yes" | "no") => void;
  purchaseFiles: File[];
  setPurchaseFiles: (f: File[]) => void;
  saleFiles: File[];
  setSaleFiles: (f: File[]) => void;
  /** Upload + read are driven by the page, which owns the draft id and form state. */
  onFilesAdded?: (side: ApsSide, files: File[]) => void;
  onFileRemoved?: (side: ApsSide, file: File) => void;
  extraction?: Record<ApsSide, ApsExtractionState>;
  /** Read a side's already-uploaded agreement again, after a failed read. */
  onRetryRead?: (side: ApsSide) => void;
  /** Per side: the agreement read fine but didn't name the signed-in client. */
  partyMismatch?: Record<ApsSide, ApsPartyMismatch | null>;
  setStep: (step: number) => void;
  step: number;
}

const Step4: React.FC<Step4Props> = ({
  closingOption,
  apsPurchaseSigned,
  setApsPurchaseSigned,
  apsSaleSigned,
  setApsSaleSigned,
  purchaseFiles,
  setPurchaseFiles,
  saleFiles,
  setSaleFiles,
  onFilesAdded,
  onFileRemoved,
  extraction,
  onRetryRead,
  partyMismatch,
  setStep,
  step,
}) => {
  const { error: toastError } = useToast();

  const showPurchase = closingOption === "buying" || closingOption === "both";
  const showSale = closingOption === "selling" || closingOption === "both";

  const leftSteps = INTAKE_STEPS;

  const handleNext = () => {
    if (showPurchase && !apsPurchaseSigned) {
      toastError("Please select whether you've signed the APS for the purchasing property.");
      return;
    }
    if (showSale && !apsSaleSigned) {
      toastError("Please select whether you've signed the APS for the sale property.");
      return;
    }

    // An agreement that doesn't name the signed-in client is the wrong file,
    // and every step after this one is built out of it. Hard stop until it's
    // removed — the on-screen notice explains why.
    if (showPurchase && partyMismatch?.purchase) {
      toastError(
        "The agreement you uploaded for the purchasing property doesn't name you. Please remove it and upload your own.",
      );
      return;
    }
    if (showSale && partyMismatch?.sale) {
      toastError(
        "The agreement you uploaded for the sale property doesn't name you. Please remove it and upload your own.",
      );
      return;
    }

    setStep(STEP_PRICE_ADDRESS);
  };

  const sideHeading =
    closingOption === "both"
      ? "Have you signed the APS?"
      : closingOption === "selling"
        ? "Have you signed the APS for the sale property?"
        : "Have you signed the APS for the purchasing property?";

  return (
    <div className="min-h-screen bg-white w-full">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row">

        {/* LEFT PANEL */}
        <div className="lg:w-80 xl:w-96 flex-shrink-0 bg-gray-50 lg:sticky lg:top-0 lg:h-screen flex flex-col border-r border-gray-100 p-8 lg:p-12">

          <div className="flex-1 overflow-y-auto">
            <div className="w-10 h-1 bg-[#C10007] rounded-full mb-10" />

            <div className="mb-6">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#C10007]">
                Step {String(step).padStart(2, "0")}
              </span>
              <h1 className="mt-3 text-2xl xl:text-3xl font-semibold text-gray-900 leading-snug">
                {sideHeading}
              </h1>
              <p className="mt-4 text-gray-500 text-sm leading-relaxed">
                It's the legal document outlining the terms of your deal.
              </p>
            </div>

            {/* PROGRESS */}
            <div className="space-y-4 mt-6">
              {leftSteps.map((item) => {
                const isCompleted = item.id < step;
                const isActive = item.id === step;

                return (
                  <div key={item.id} className="flex items-center gap-4">
                    <div
                      className={`h-8 w-8 flex items-center justify-center rounded-full text-sm font-bold transition-all
                        ${
                          isCompleted
                            ? "bg-gray-300 text-gray-600"
                            : isActive
                            ? "bg-[#C10007] text-white"
                            : "bg-gray-200 text-gray-400"
                        }`}
                    >
                      {item.id}
                    </div>

                    <span
                      className={`text-sm transition-colors
                        ${
                          isActive || isCompleted
                            ? "text-gray-900 font-semibold"
                            : "text-gray-400"
                        }`}
                    >
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 p-6 sm:p-10 lg:p-16 pb-28 lg:pb-16 overflow-y-auto">
          <div className="space-y-6 w-full max-w-2xl">

            {/* Header */}
            <div>
              <h2 className="text-3xl font-semibold text-gray-900">
                {sideHeading}
              </h2>
              <p className="mt-3 text-gray-500 text-sm leading-relaxed">
                Let us know which Agreements of Purchase and Sale (APS), amendments and schedules you've signed so we can prepare your file accordingly.
              </p>
            </div>

            <div className="space-y-6 divide-y divide-gray-100">
              {showPurchase && (
                <div className={showPurchase && showSale ? "" : ""}>
                  <ApsBlock
                    side="purchase"
                    signed={apsPurchaseSigned}
                    setSigned={setApsPurchaseSigned}
                    files={purchaseFiles}
                    setFiles={setPurchaseFiles}
                    onFilesAdded={onFilesAdded}
                    onFileRemoved={onFileRemoved}
                    extraction={extraction?.purchase}
                    onRetryRead={onRetryRead}
                    partyMismatch={partyMismatch?.purchase}
                    showHeading={showPurchase && showSale}
                  />
                </div>
              )}
              {showSale && (
                <div className={showPurchase && showSale ? "pt-6" : ""}>
                  <ApsBlock
                    side="sale"
                    signed={apsSaleSigned}
                    setSigned={setApsSaleSigned}
                    files={saleFiles}
                    setFiles={setSaleFiles}
                    onFilesAdded={onFilesAdded}
                    onFileRemoved={onFileRemoved}
                    extraction={extraction?.sale}
                    onRetryRead={onRetryRead}
                    partyMismatch={partyMismatch?.sale}
                    showHeading={showPurchase && showSale}
                  />
                </div>
              )}
            </div>

            {/* Desktop button row */}
            <div className="hidden lg:flex items-center justify-between pt-6 border-t border-gray-100">
              <Button onClick={() => setStep(STEP_SERVICE)} variant="secondary" size="md">
                <ChevronLeft size={16} strokeWidth={2.5} /> Back
              </Button>
              <Button onClick={handleNext} variant="primary" size="md">
                Continue <ChevronRight size={16} strokeWidth={2.5} />
              </Button>
            </div>

            {/* Mobile fixed bottom buttons */}
            <div className="lg:hidden fixed bottom-0 left-0 w-full px-5 py-4 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] flex gap-3">
              <Button onClick={() => setStep(STEP_SERVICE)} variant="secondary" size="lg" className="flex-1">
                <ChevronLeft size={18} strokeWidth={2.5} /> Back
              </Button>
              <Button onClick={handleNext} variant="primary" size="lg" className="flex-1">
                Continue <ChevronRight size={18} strokeWidth={2.5} />
              </Button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default Step4;
