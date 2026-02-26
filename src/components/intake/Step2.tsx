"use client";

import React, { useState, useEffect } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

interface Step2Props {
    purchasePrice: string;
    setPurchasePrice: (value: string) => void;
    setStep: (step: number) => void;
    step: number;
    agreementSigned: "yes" | "no" | null;
}

const Step2: React.FC<Step2Props> = ({
    purchasePrice,
    setPurchasePrice,
    setStep,
    step,
    agreementSigned
}) => {
    const [isValid, setIsValid] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const numericValue = parseFloat(
            purchasePrice.replace(/[^0-9.]/g, "")
        );

        const MIN_PRICE = 100000;
        const MAX_PRICE = 100000000;

        if (purchasePrice.trim() === "") {
            setError("");
            setIsValid(false);
        } else if (isNaN(numericValue)) {
            setError("Please enter a valid number.");
            setIsValid(false);
        } else if (numericValue < MIN_PRICE) {
            setError("Property price must be at least ₹1,00,000.");
            setIsValid(false);
        } else if (numericValue > MAX_PRICE) {
            setError("Property price cannot exceed ₹10,00,00,000.");
            setIsValid(false);
        } else {
            setError("");
            setIsValid(true);
        }
    }, [purchasePrice]);

    // ✅ SAME WORKFLOW AS STEP1
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

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row">

                {/* LEFT PANEL */}
                <div className="lg:w-80 xl:w-96 flex-shrink-0 bg-gray-50 lg:sticky lg:top-0 lg:h-screen flex flex-col border-r border-gray-100 p-8 lg:p-12">

                    <div className="flex-1 overflow-y-auto">
                        <div className="w-10 h-1 bg-[#C10007] rounded-full mb-10" />

                        <div className="mb-6">
                            <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#C10007]">
                                Step {String(step).padStart(2, "0")}
                            </span>
                            <h1 className="mt-3 text-2xl xl:text-3xl font-semibold text-gray-900">
                                Enter the purchase price
                            </h1>
                            <p className="mt-4 text-gray-500 text-sm">
                                Provide the purchase price for the property to continue.
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

                    {/* Buttons */}
                    <div className="mt-6 flex gap-3">
                        <Button
                            onClick={() => setStep(1)}
                            variant="secondary"
                            size="md"
                            className="flex-1"
                        >
                            Previous
                        </Button>

                        <Button
                            onClick={() => setStep(3)}
                            disabled={!isValid}
                            variant="primary"
                            size="md"
                            className="flex-1"
                        >
                            Next
                        </Button>
                    </div>
                </div>

                {/* RIGHT PANEL */}
                <div className="flex-1 p-6 sm:p-10 lg:p-16 overflow-y-auto">
                    <h1 className="text-3xl font-semibold mb-6">
                        Enter the purchase price for the property.
                    </h1>

                    <Input
                        label="Purchase Price"
                        type="text"
                        value={purchasePrice}
                        onChange={(e) => setPurchasePrice(e.target.value)}
                        placeholder="$ 1,250,000"
                        className="mb-2"
                    />

                    {error && (
                        <p className="text-sm text-red-600">{error}</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Step2;