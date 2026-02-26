"use client";

import React, { useState, useEffect } from "react";
import Button from "@/components/ui/Button";

interface Step4Props {
  agreementSigned: "yes" | "no" | null;
  setAgreementSigned: (value: "yes" | "no") => void;
  setStep: (step: number) => void;
  step: number;
}

const Step4: React.FC<Step4Props> = ({
  agreementSigned,
  setAgreementSigned,
  setStep,
  step
}) => {
  const [isSelected, setIsSelected] = useState<"yes" | "no" | null>(agreementSigned);

  useEffect(() => {
    setIsSelected(agreementSigned);
  }, [agreementSigned]);

  // ✅ SAME WORKFLOW AS OTHER STEPS
  const leftSteps = [
    { id: 1, label: "Select Service" },
    { id: 2, label: "Purchase Price" },
    { id: 3, label: "Address" },
    { id: 4, label: "Agreement Signed" },
    ...(agreementSigned === "yes"
      ? [{ id: 5, label: "Upload Document" }]
      : []),
    {
      id: agreementSigned === "yes" ? 6 : 5,
      label: "Contact Info",
    },
  ];

  // 🔥 Next Step Logic
  const handleNext = () => {
    if (!isSelected) return;

    if (isSelected === "yes") {
      setStep(5); // Upload step
    } else {
      setStep(5); // Contact step (parent already handles condition)
    }
  };

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
                Have you signed the Agreement of Purchase and Sale?
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

          {/* DESKTOP BUTTONS */}
          <div className="mt-6 flex gap-3">
            <Button
              onClick={() => setStep(3)}
              variant="secondary"
              size="md"
              className="flex-1"
            >
              Previous
            </Button>

            <Button
              onClick={handleNext}
              disabled={!isSelected}
              variant="primary"
              size="md"
              className="flex-1"
            >
              Next
            </Button>
          </div>

       
        </div>

        {/* RIGHT PANEL (UNCHANGED) */}
        <div className="flex-1 p-6 sm:p-10 lg:p-12 overflow-y-auto">
          <div className="space-y-6 w-full">

            <div
              onClick={() => setAgreementSigned("yes")}
              className={`cursor-pointer rounded-2xl border-2 p-8 transition-all duration-200 ${
                agreementSigned === "yes"
                  ? "border-[#C10007] bg-white shadow-md"
                  : "border-gray-200 hover:border-[#C10007] hover:shadow-sm"
              }`}
            >
              <h3 className="text-xl font-semibold text-gray-900">Yes</h3>
              <p className="mt-2 text-gray-500">I've signed the agreement.</p>
            </div>

            <div
              onClick={() => setAgreementSigned("no")}
              className={`cursor-pointer rounded-2xl border-2 p-8 transition-all duration-200 ${
                agreementSigned === "no"
                  ? "border-[#C10007] bg-white shadow-md"
                  : "border-gray-200 hover:border-[#C10007] hover:shadow-sm"
              }`}
            >
              <h3 className="text-xl font-semibold text-gray-900">No</h3>
              <p className="mt-2 text-gray-500">I haven't signed it yet.</p>
            </div>

            {/* MOBILE CTA */}
            <div className="lg:hidden flex justify-between mt-10 gap-3">
              <Button
                onClick={() => setStep(3)}
                variant="secondary"
                size="md"
                className="flex-1"
              >
                Previous
              </Button>

              <Button
                onClick={handleNext}
                disabled={!isSelected}
                variant="primary"
                size="md"
                className="flex-1"
              >
                Next
              </Button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default Step4;