// components/intake/Step5Upload.tsx
"use client";

import { UploadCloud, ChevronLeft, ChevronRight } from "lucide-react";
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
        { id: 2, label: "Price" },
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

    return (
        <div className="min-h-screen bg-white w-full">
            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row">

                {/* LEFT STICKY PANEL */}
                <div className="lg:w-80 xl:w-96 flex-shrink-0 bg-gray-50 lg:sticky lg:top-0 lg:h-screen flex flex-col border-r border-gray-100 p-8 lg:p-12">

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto">

                        <div className="w-10 h-1 bg-[var(--color-primary)] rounded-full mb-10" />

                        <div className="mb-6">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                                    Step {String(step).padStart(2, "0")}
                                </span>
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 uppercase tracking-wide">
                                    Optional
                                </span>
                            </div>

                            <h1 className="mt-3 text-2xl xl:text-3xl font-semibold text-gray-900 leading-snug">
                                Share your Agreement of Purchase and Sale
                            </h1>

                            <p className="mt-4 text-gray-500 text-sm leading-relaxed">
                                Upload your signed agreement so we can review it early — or skip and do it later.
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

                </div>

                {/* RIGHT CONTENT PANEL */}
                <div className="flex-1 p-6 sm:p-10 lg:p-12 pb-28 lg:pb-12 overflow-y-auto">
                    <div className="space-y-6 w-full">

                        {/* Upload zone */}
                        <div
                            className="border-2 border-dashed border-gray-300 rounded-2xl p-14 flex flex-col items-center justify-center bg-white cursor-pointer hover:border-[#C10007] transition-colors"
                            onClick={() => document.getElementById("agreement-file")?.click()}
                        >
                            <UploadCloud size={28} className="text-gray-400 mb-4" />
                            <p className="text-gray-600 text-lg text-center">
                                Click to <span className="text-[#C10007] font-medium">browse</span> or drag & drop your file
                            </p>
                            <p className="text-gray-400 text-sm mt-2">PDF, JPG, PNG — max 10 MB</p>
                            <input
                                id="agreement-file"
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                className="hidden"
                                onChange={(e) => e.target.files && setUploadedFile(e.target.files[0])}
                            />
                        </div>

                        {uploadedFile ? (
                            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                                <p className="text-green-700 text-sm font-medium truncate">
                                    ✓ {uploadedFile.name}
                                </p>
                                <button
                                    onClick={() => setUploadedFile(null)}
                                    className="text-xs text-gray-400 hover:text-red-500 ml-3 flex-shrink-0 cursor-pointer transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                        ) : (
                            <p className="text-center text-sm text-gray-400">
                                Don't have it yet?{" "}
                                <button
                                    onClick={() => setStep(agreementSigned === "yes" ? 6 : 5)}
                                    className="text-gray-500 underline underline-offset-2 hover:text-[#C10007] transition-colors cursor-pointer font-medium"
                                >
                                    Skip for now
                                </button>
                            </p>
                        )}

                        {/* Desktop button row */}
                        <div className="hidden lg:flex items-center justify-between pt-6 border-t border-gray-100">
                            <Button onClick={() => setStep(4)} variant="secondary" size="md">
                                <ChevronLeft size={16} strokeWidth={2.5} /> Back
                            </Button>
                            <Button onClick={() => setStep(agreementSigned === "yes" ? 6 : 5)} variant="primary" size="md">
                                Continue <ChevronRight size={16} strokeWidth={2.5} />
                            </Button>
                        </div>

                        {/* Mobile fixed bottom buttons */}
                        <div className="lg:hidden fixed bottom-0 left-0 w-full px-5 py-4 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] flex gap-3">
                            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setStep(4)}>
                                <ChevronLeft size={18} strokeWidth={2.5} /> Back
                            </Button>
                            <Button variant="primary" size="lg" className="flex-1" onClick={() => setStep(agreementSigned === "yes" ? 6 : 5)}>
                                Continue <ChevronRight size={18} strokeWidth={2.5} />
                            </Button>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}