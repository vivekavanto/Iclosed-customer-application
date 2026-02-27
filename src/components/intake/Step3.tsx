"use client";

import React, { useState, useEffect } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

interface Step3Props {
    formData: {
        street: string;
        unit: string;
        city: string;
        postalCode: string;
    };
    setFormData: (data: {
        street: string;
        unit: string;
        city: string;
        postalCode: string;
    }) => void;
    setStep: (step: number) => void;
    step: number;
    agreementSigned: "yes" | "no" | null;
}

const Step3: React.FC<Step3Props> = ({
    formData,
    setFormData,
    setStep,
    step,
    agreementSigned
}) => {
    const [isValid, setIsValid] = useState(false);
    const [errors, setErrors] = useState<{
        street?: string;
        city?: string;
        postalCode?: string;
        unit?: string;
    }>({});
    const [touched, setTouched] = useState<{
        street?: boolean;
        city?: boolean;
        postalCode?: boolean;
        unit?: boolean;
    }>({});

    useEffect(() => {
        const newErrors: typeof errors = {};

        if (!formData.street.trim()) newErrors.street = "Street address is required.";

        if (!formData.city.trim()) {
            newErrors.city = "City is required.";
        } else if (!/^[A-Za-z\s-]+$/.test(formData.city.trim())) {
            newErrors.city = "City must contain only letters.";
        } else if (formData.city.trim().length < 2) {
            newErrors.city = "City name is too short.";
        }

        const postalRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
        if (!formData.postalCode.trim()) {
            newErrors.postalCode = "Postal code is required.";
        } else if (!postalRegex.test(formData.postalCode.trim())) {
            newErrors.postalCode = "Enter a valid postal code.";
        }

        if (formData.unit.trim()) {
            const unitRegex = /^[A-Za-z0-9-]+$/;
            if (!unitRegex.test(formData.unit.trim())) {
                newErrors.unit = "Unit can only contain letters, numbers, or hyphens.";
            } else if (formData.unit.trim().length > 10) {
                newErrors.unit = "Unit number is too long.";
            }
        }

        setErrors(newErrors);
        setIsValid(Object.keys(newErrors).length === 0);
    }, [formData]);

    const leftSteps = [
        { id: 1, label: "Select Service" },
        { id: 2, label: "Purchase Price" },
        { id: 3, label: "Address" },
        { id: 4, label: "Agreement Signed" },
        ...(agreementSigned === "yes" ? [{ id: 5, label: "Upload Document" }] : []),
        { id: agreementSigned === "yes" ? 6 : 5, label: "Contact Info" },
    ];

    const handleBlur = (field: keyof typeof touched) => {
        setTouched({ ...touched, [field]: true });
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
                                Enter the address of the property
                            </h1>
                            <p className="mt-4 text-gray-500 text-sm leading-relaxed">
                                (iClosed currently only serves Ontario)
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
                                                ${isCompleted
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

                    {/* Buttons */}
                    <div className="mt-6 flex gap-3">
                        {/* Large screens buttons */}
                        <div className="hidden lg:flex flex-1 gap-3">
                            <Button
                                onClick={() => setStep(2)}
                                variant="secondary"
                                size="md"
                                className="flex-1"
                            >
                                Previous
                            </Button>

                            <Button
                                onClick={() => setStep(4)}
                                disabled={!isValid}
                                variant="primary"
                                size="md"
                                className="flex-1"
                            >
                                Next
                            </Button>
                        </div>

                        {/* Fixed bottom buttons on small/medium screens */}
                        <div className="lg:hidden fixed bottom-0 left-0 w-full px-6 py-4 bg-gray-50 flex gap-3">
                            <Button
                                onClick={() => setStep(2)}
                                variant="secondary"
                                size="md"
                                className="flex-1"
                            >
                                Previous
                            </Button>

                            <Button
                                onClick={() => setStep(4)}
                                disabled={!isValid}
                                variant="primary"
                                size="md"
                                className="flex-1"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL */}
                <div className="flex-1 p-6 sm:p-10 lg:p-16 overflow-y-auto">
                    <div className="space-y-6 w-full">
                        <Input
                            label="Street Address"
                            required
                            value={formData.street}
                            onChange={(e) =>
                                setFormData({ ...formData, street: e.target.value })
                            }
                            onBlur={() => handleBlur("street")}
                        />
                        {touched.street && errors.street && (
                            <p className="text-red-600 text-sm mt-1">{errors.street}</p>
                        )}

                        <Input
                            label="Unit/Apartment/Suite Number"
                            placeholder="123"
                            value={formData.unit}
                            onChange={(e) =>
                                setFormData({ ...formData, unit: e.target.value })
                            }
                            onBlur={() => handleBlur("unit")}
                        />
                        {touched.unit && errors.unit && (
                            <p className="text-red-600 text-sm mt-1">{errors.unit}</p>
                        )}

                        <Input
                            label="City"
                            placeholder="Toronto"
                            required
                            value={formData.city}
                            onChange={(e) =>
                                setFormData({ ...formData, city: e.target.value })
                            }
                            onBlur={() => handleBlur("city")}
                        />
                        {touched.city && errors.city && (
                            <p className="text-red-600 text-sm mt-1">{errors.city}</p>
                        )}

                        <Input
                            label="Postal Code"
                            placeholder="A1C 2B3"
                            required
                            value={formData.postalCode}
                            onChange={(e) =>
                                setFormData({ ...formData, postalCode: e.target.value })
                            }
                            onBlur={() => handleBlur("postalCode")}
                        />
                        {touched.postalCode && errors.postalCode && (
                            <p className="text-red-600 text-sm mt-1">{errors.postalCode}</p>
                        )}

                        <div className="flex flex-col gap-1.5 w-full">
                            <label className="text-sm font-medium text-gray-900">Province</label>
                            <select
                                className="w-full px-4 py-2.5 rounded-sm border text-sm bg-gray-100 border-gray-200"
                                defaultValue="Ontario"
                                disabled
                            >
                                <option>Ontario</option>
                            </select>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Step3;