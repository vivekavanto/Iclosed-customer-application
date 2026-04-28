"use client";

import React, { useState, useCallback } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ChevronLeft, ChevronRight, UploadCloud } from "lucide-react";

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
  file: File | null;
  setFile: (f: File | null) => void;
}

const ApsBlock: React.FC<ApsBlockProps> = ({ side, signed, setSigned, file, setFile }) => {
  const [isDragging, setIsDragging] = useState(false);
  const { error: toastError } = useToast();

  const inputId = `aps-file-${side}`;
  const heading =
    side === "purchase"
      ? "APS for Purchasing Property"
      : "APS for Sale Property";
  const subheading =
    side === "purchase"
      ? "Have you signed the Agreement of Purchase and Sale for the property you're buying?"
      : "Have you signed the Agreement of Purchase and Sale for the property you're selling?";

  const handlePickFile = useCallback(
    (f: File) => {
      const err = validateFile(f);
      if (err) {
        toastError(err);
        return;
      }
      setFile(f);
    },
    [setFile, toastError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handlePickFile(f);
    },
    [handlePickFile]
  );

  const optionClass = (active: boolean) =>
    `cursor-pointer rounded-xl border-2 px-4 py-3 transition-all duration-200 text-center font-medium ${
      active
        ? "border-[#C10007] bg-white shadow-sm text-[#C10007]"
        : "border-gray-200 text-gray-700 hover:border-[#C10007]"
    }`;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{heading}</h3>
        <p className="mt-1 text-gray-500 text-sm">{subheading}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div onClick={() => setSigned("yes")} className={optionClass(signed === "yes")}>
          Yes, I've signed it
        </div>
        <div onClick={() => setSigned("no")} className={optionClass(signed === "no")}>
          No, not yet
        </div>
      </div>

      {signed === "yes" && (
        <div className="pt-1">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-semibold text-gray-900">
              Upload your {heading}
            </p>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 uppercase tracking-wide">
              Optional
            </span>
          </div>

          <div
            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              isDragging
                ? "border-[#C10007] bg-red-50"
                : "border-gray-300 bg-white hover:border-[#C10007]"
            }`}
            onClick={() => document.getElementById(inputId)?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <UploadCloud size={22} className="text-gray-400 mb-2" />
            <p className="text-gray-600 text-sm text-center">
              Click to <span className="text-[#C10007] font-medium">browse</span> or drag & drop your file
            </p>
            <p className="text-gray-400 text-xs mt-1">PDF, JPG, PNG — max 10 MB</p>
            <input
              id={inputId}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePickFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {file && (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3 mt-4">
              <p className="text-green-700 text-sm font-medium truncate">
                ✓ {file.name}
              </p>
              <button
                onClick={() => setFile(null)}
                className="text-xs text-gray-400 hover:text-red-500 ml-3 flex-shrink-0 cursor-pointer transition-colors"
              >
                Remove
              </button>
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
  purchaseFile: File | null;
  setPurchaseFile: (f: File | null) => void;
  saleFile: File | null;
  setSaleFile: (f: File | null) => void;
  setStep: (step: number) => void;
  step: number;
}

const Step4: React.FC<Step4Props> = ({
  closingOption,
  apsPurchaseSigned,
  setApsPurchaseSigned,
  apsSaleSigned,
  setApsSaleSigned,
  purchaseFile,
  setPurchaseFile,
  saleFile,
  setSaleFile,
  setStep,
  step,
}) => {
  const { error: toastError } = useToast();

  const showPurchase = closingOption === "buying" || closingOption === "both";
  const showSale = closingOption === "selling" || closingOption === "both";

  const leftSteps = [
    { id: 1, label: "Select Service" },
    { id: 2, label: "Price & Address" },
    { id: 3, label: "Agreement" },
    { id: 4, label: "Contact Info" },
  ];

  const handleNext = () => {
    if (showPurchase && !apsPurchaseSigned) {
      toastError("Please select whether you've signed the APS for the purchasing property.");
      return;
    }
    if (showSale && !apsSaleSigned) {
      toastError("Please select whether you've signed the APS for the sale property.");
      return;
    }
    setStep(4);
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
                Let us know which Agreements of Purchase and Sale you've already signed so we can prepare your file accordingly.
              </p>
            </div>

            {showPurchase && (
              <ApsBlock
                side="purchase"
                signed={apsPurchaseSigned}
                setSigned={setApsPurchaseSigned}
                file={purchaseFile}
                setFile={setPurchaseFile}
              />
            )}

            {showPurchase && showSale && (
              <div className="border-t border-gray-200" />
            )}

            {showSale && (
              <ApsBlock
                side="sale"
                signed={apsSaleSigned}
                setSigned={setApsSaleSigned}
                file={saleFile}
                setFile={setSaleFile}
              />
            )}

            {/* Desktop button row */}
            <div className="hidden lg:flex items-center justify-between pt-6 border-t border-gray-100">
              <Button onClick={() => setStep(2)} variant="secondary" size="md">
                <ChevronLeft size={16} strokeWidth={2.5} /> Back
              </Button>
              <Button onClick={handleNext} variant="primary" size="md">
                Continue <ChevronRight size={16} strokeWidth={2.5} />
              </Button>
            </div>

            {/* Mobile fixed bottom buttons */}
            <div className="lg:hidden fixed bottom-0 left-0 w-full px-5 py-4 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] flex gap-3">
              <Button onClick={() => setStep(2)} variant="secondary" size="lg" className="flex-1">
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
