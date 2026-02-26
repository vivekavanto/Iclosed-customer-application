// components/intake/Step5Upload.tsx
"use client";

import { UploadCloud } from "lucide-react";
import React from "react";
import Button from "@/components/ui/Button";

interface Step5UploadProps {
    setStep: (step: number) => void;
    uploadedFile: File | null;
    setUploadedFile: (file: File | null) => void;
    agreementSigned: "yes" | "no" | null;
    step: number;
}
export default function Step5Upload({
    setStep,
    uploadedFile,
    setUploadedFile,
    agreementSigned,
    step
}: Step5UploadProps): React.ReactElement {
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
    {
        return (
            <div className="min-h-screen bg-white w-full">
                <div className="max-w-7xl flex flex-col lg:flex-row">

                    {/* LEFT STICKY PANEL */}
                    <div className="lg:w-80 xl:w-96 flex-shrink-0 bg-gray-50 lg:sticky lg:top-0 lg:h-screen flex flex-col border-r border-gray-100 p-8 lg:p-12">

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto">

                            <div className="w-10 h-1 bg-[var(--color-primary)] rounded-full mb-10" />

                            <div className="mb-6">
                                <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                                    Step {String(step).padStart(2, "0")}
                                </span>

                                <h1 className="mt-3 text-2xl xl:text-3xl font-semibold text-gray-900 leading-snug">
                                    Share your Agreement of Purchase and Sale
                                </h1>

                                <p className="mt-4 text-gray-500 text-sm leading-relaxed">
                                    Upload your signed agreement so we can review and proceed.
                                </p>
                            </div>

                            {/* Progress Steps */}
                            <div className="space-y-4 mt-6">
                                {leftSteps.map((item) => {
                                    const isCompleted = item.id < step;
                                    const isActive = item.id === step;

                                    return (
                                        <div key={item.id} className="flex items-center gap-4">
                                            <div
                                                className={`h-8 w-8 flex items-center justify-center rounded-full text-sm font-bold transition-all
                        ${isCompleted
                                                        ? "bg-gray-300 text-gray-600"
                                                        : isActive
                                                            ? "bg-[var(--color-primary)] text-white"
                                                            : "bg-gray-200 text-gray-400"
                                                    }`}
                                            >
                                                {item.id}
                                            </div>

                                            <span
                                                className={`text-sm transition-colors
                        ${isActive || isCompleted
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

                        {/* Desktop CTA */}
                        <div className="mt-6 flex gap-3 flex-shrink-0">
                            <Button
                                onClick={() => setStep(4)}
                                variant="secondary"
                                className="flex-1"
                            >
                                Previous
                            </Button>

                            <Button
                                onClick={() => setStep(agreementSigned === "yes" ? 6 : 5)}
                                variant="primary"
                                className="flex-1"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                    {/* RIGHT CONTENT PANEL */}
                    <div className="flex-1 p-6 sm:p-10 lg:p-12 overflow-y-auto">
                        <div className="space-y-6 w-full">

                            <div
                                className="border-2 border-dashed border-gray-300 rounded-2xl p-16 flex flex-col items-center justify-center bg-white cursor-pointer hover:border-[#C10007]"
                                onClick={() => document.getElementById("agreement-file")?.click()}
                            >
                                <UploadCloud size={28} className="text-gray-400 mb-4" />
                                <p className="text-gray-600 text-lg">
                                    Click to <span className="text-[#C10007] font-medium">browse</span> or drag & drop your file
                                </p>
                                <input
                                    id="agreement-file"
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => e.target.files && setUploadedFile(e.target.files[0])}
                                />
                            </div>

                            {uploadedFile && (
                                <p className="mt-4 text-green-600 text-sm">
                                    Selected file: {uploadedFile.name}
                                </p>
                            )}

                            {/* Mobile CTA */}
                            <div className="lg:hidden flex gap-3 mt-12">
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={() => setStep(4)}
                                >
                                    Previous
                                </Button>

                                <Button
                                    variant="primary"
                                    className="flex-1"
                                    onClick={() => setStep(agreementSigned === "yes" ? 6 : 5)}
                                >
                                    Next
                                </Button>
                            </div>

                        </div>
                    </div>

                </div>
            </div>
        );
    }
}