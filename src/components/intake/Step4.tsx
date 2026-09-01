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

type Side = "purchase" | "sale";

interface ApsBlockProps {
  side: Side;
  files: File[];
  setFiles: (f: File[]) => void;
  /** Fired for the files that passed validation, so the page can upload and read them. */
  onFilesAdded?: (side: Side, files: File[]) => void;
  onFileRemoved?: (side: Side, file: File) => void;
  /** Upload / read progress for this side. */
  extraction?: ApsExtractionState;
  /** Read the already-uploaded agreement again. Offered after a failed read. */
  onRetryRead?: (side: Side) => void;
  // Show the per-side "APS for Purchasing/Sale Property" label above the
  // upload box. Only needed in "both" mode to tell the two blocks apart — in a
  // single-side flow it just repeats the page heading, so it's hidden.
  showHeading: boolean;
}

const ApsBlock: React.FC<ApsBlockProps> = ({
  side,
  files,
  setFiles,
  onFilesAdded,
  onFileRemoved,
  extraction,
  onRetryRead,
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

  return (
    <div className="space-y-4">
      {showHeading && (
        <div>
          <h3 className="text-base font-semibold text-gray-900">{heading}</h3>
          <p className="mt-0.5 text-gray-500 text-xs">{helper}</p>
        </div>
      )}

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

        {/* Read status. Nothing here ever blocks Continue: a slow, failed or
            unhelpful read just leaves the next steps blank and the client
            fills them in as they always have. */}
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
                {!extraction.result.is_aps ? (
                  <p className="flex items-start gap-2 text-xs text-gray-500">
                    <AlertCircle size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    That doesn&apos;t look like an Agreement of Purchase and Sale, so we
                    haven&apos;t filled anything in. We&apos;ve kept the file with your
                    submission.
                  </p>
                ) : hasAnyExtractedValue(extraction.result) ? (
                  <p className="flex items-start gap-2 text-xs text-green-700">
                    <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" />
                    We read {countExtractedValues(extraction.result)} details from your{" "}
                    {files.length > 1
                      ? `${files.length} documents, amendments included`
                      : "agreement"}
                    . They&apos;re filled in on the next steps — please check them
                    before you submit.
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

          </div>
        )}
      </div>
    </div>
  );
};

interface Step4Props {
  closingOption: "buying" | "selling" | "both" | null;
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
  setStep: (step: number) => void;
  step: number;
}

const Step4: React.FC<Step4Props> = ({
  closingOption,
  purchaseFiles,
  setPurchaseFiles,
  saleFiles,
  setSaleFiles,
  onFilesAdded,
  onFileRemoved,
  extraction,
  onRetryRead,
  setStep,
  step,
}) => {
  const showPurchase = closingOption === "buying" || closingOption === "both";
  const showSale = closingOption === "selling" || closingOption === "both";

  const leftSteps = INTAKE_STEPS;

  // The upload is optional — nothing here blocks the client from moving on.
  const handleNext = () => {
    setStep(STEP_PRICE_ADDRESS);
  };

  const sideHeading =
    closingOption === "both"
      ? "Please upload your APS for your properties"
      : closingOption === "selling"
        ? "Please upload your APS for your sale property"
        : "Please upload your APS for your purchasing property";

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
                Upload the signed Agreement of Purchase and Sale (APS) along with any amendments and schedules — we&apos;ll pull the details straight from your documents.
              </p>
            </div>

            <div className="space-y-6 divide-y divide-gray-100">
              {showPurchase && (
                <div className={showPurchase && showSale ? "" : ""}>
                  <ApsBlock
                    side="purchase"
                    files={purchaseFiles}
                    setFiles={setPurchaseFiles}
                    onFilesAdded={onFilesAdded}
                    onFileRemoved={onFileRemoved}
                    extraction={extraction?.purchase}
                    onRetryRead={onRetryRead}
                    showHeading={showPurchase && showSale}
                  />
                </div>
              )}
              {showSale && (
                <div className={showPurchase && showSale ? "pt-6" : ""}>
                  <ApsBlock
                    side="sale"
                    files={saleFiles}
                    setFiles={setSaleFiles}
                    onFilesAdded={onFilesAdded}
                    onFileRemoved={onFileRemoved}
                    extraction={extraction?.sale}
                    onRetryRead={onRetryRead}
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
