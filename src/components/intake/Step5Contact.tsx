"use client";

import { Plus, Clock, Video } from "lucide-react";
import React from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import DateTimePicker from "@/components/intake/DateTimePicker";

interface Step5ContactProps {
    setStep: (step: number) => void;
    agreementSigned: "yes" | "no" | null;
    setAgreementSigned: (value: "yes" | "no" | null) => void;
    setShowSuccessModal: (show: boolean) => void;
    step: number;
}

export default function Step5Contact({
    setStep,
    agreementSigned,
    setAgreementSigned,
    setShowSuccessModal,
    step
}: Step5ContactProps) {

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
    const [formData, setFormData] = React.useState({
        fullName: "",
        email: "",
        phone: "",
    });

    const [errors, setErrors] = React.useState<{
        fullName?: string;
        email?: string;
        phone?: string;
    }>({});

    React.useEffect(() => {
        const newErrors: typeof errors = {};
        if (!formData.fullName.trim()) {
            newErrors.fullName = "Full name is required.";
        } else if (!/^[A-Za-z\s]+$/.test(formData.fullName.trim())) {
            newErrors.fullName = "Name can only contain letters.";
        } else if (formData.fullName.trim().length < 3) {
            newErrors.fullName = "Name is too short.";
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!formData.email.trim()) {
            newErrors.email = "Email is required.";
        } else if (!emailRegex.test(formData.email.trim())) {
            newErrors.email = "Enter a valid email address.";
        }

        const phoneRegex = /^[0-9()\-\s+]+$/;
        if (!formData.phone.trim()) {
            newErrors.phone = "Phone number is required.";
        } else if (!phoneRegex.test(formData.phone.trim())) {
            newErrors.phone = "Enter a valid phone number.";
        } else if (formData.phone.replace(/\D/g, "").length < 10) {
            newErrors.phone = "Phone number must be at least 10 digits.";
        }

        setErrors(newErrors);
        setIsValid(Object.keys(newErrors).length === 0);
    }, [formData]);
    const [isValid, setIsValid] = React.useState(false);
    return (
        <div className="min-h-screen bg-white w-full">
            <div className="max-w-7xl flex flex-col lg:flex-row">

                {/* LEFT STICKY PANEL */}
                <div className="lg:w-80 xl:w-96 flex-shrink-0 bg-gray-50 lg:sticky lg:top-0 lg:h-screen flex flex-col border-r border-gray-100 p-8 lg:p-12">

                    {/* Scrollable Content Area */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="w-10 h-1 bg-[#C10007] rounded-full mb-10" />

                        <div className="mb-6">
                            <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#C10007]">
                                Step {String(step).padStart(2, "0")}
                            </span>

                            <h1 className="mt-3 text-2xl xl:text-3xl font-semibold text-gray-900 leading-snug">
                                We'll be in touch
                            </h1>

                            <p className="mt-4 text-gray-500 text-sm leading-relaxed">
                                Fill in your contact details and schedule a meeting if needed.
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

                    {/* Desktop Buttons */}
                    <div className="mt-6 flex gap-3 flex-shrink-0 flex-col sm:flex-row">
                        <Button
                            onClick={() => {
                                if (agreementSigned === "no") setAgreementSigned(null);
                                setStep(4);
                            }}
                            variant="secondary"
                            size="md"
                            className="flex-1"
                        >
                            Previous
                        </Button>

                        <Button
                            onClick={() => setShowSuccessModal(true)}
                            variant="primary"
                            size="md"
                            className="flex-1"
                            disabled={!isValid}
                        >
                            Complete
                        </Button>
                    </div>

                </div>

                {/* ================= RIGHT PANEL ================= */}
                <div className="flex-1 p-6 sm:p-10 lg:p-12">
                    <div className="space-y-8 ">

                        {/* Contact Form */}
                        <Input
                            label="Full Name"
                            placeholder="John Doe"
                            value={formData.fullName}
                            onChange={(e) =>
                                setFormData({ ...formData, fullName: e.target.value })
                            }
                        />
                        {errors.fullName && (
                            <p className="text-red-600 text-sm mt-1">{errors.fullName}</p>
                        )}
                        <Input
                            label="Email Address"
                            placeholder="john@doe.com"
                            value={formData.email}
                            onChange={(e) =>
                                setFormData({ ...formData, email: e.target.value })
                            }
                        />
                        {errors.email && (
                            <p className="text-red-600 text-sm mt-1">{errors.email}</p>
                        )}
                        <Input
                            label="Phone Number"
                            placeholder="(555)-123-4567"
                            value={formData.phone}
                            onChange={(e) =>
                                setFormData({ ...formData, phone: e.target.value })
                            }
                        />
                        {errors.phone && (
                            <p className="text-red-600 text-sm mt-1">{errors.phone}</p>
                        )}


                        {/* Add Co-Purchaser */}
                        <div>
                            <Button
                                variant="ghost"
                                className="w-full border border-dashed border-red-200 text-gray-900 hover:text-[#C10007] hover:bg-transparent"
                            >
                                <Plus size={18} />
                                Add Co-Purchaser
                            </Button>
                        </div>

                        {/* Conditional Meeting Section */}
                        {agreementSigned === "no" && (
                            <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col md:flex-row min-h-[500px]">

                                {/* Left Info */}
                                <div className="w-full md:w-1/3 p-8 border-b md:border-b-0 md:border-r border-gray-100 bg-white">
                                    <p className="text-gray-500 font-medium">Nava Wilson</p>
                                    <h2 className="text-2xl font-bold text-gray-900 mt-1">
                                        IClosed Lead Meeting
                                    </h2>

                                    <div className="mt-6 space-y-4">
                                        <div className="flex items-center gap-3 text-gray-600">
                                            <Clock size={20} /> 15 min
                                        </div>
                                        <div className="flex items-start gap-3 text-gray-600">
                                            <Video size={20} />
                                            Web conferencing details provided upon confirmation.
                                        </div>
                                    </div>
                                </div>

                                {/* Date Picker */}
                                <DateTimePicker
                                    onChange={(date, time) => {
                                        console.log("Selected Date:", date);
                                        console.log("Selected Time:", time);
                                    }}
                                />
                            </div>
                        )}

                        {/* Mobile Buttons */}
                        <div className="lg:hidden flex gap-3 pt-8">
                            <Button
                                variant="secondary"
                                className="flex-1"
                                onClick={() => {
                                    if (agreementSigned === "no") {
                                        setAgreementSigned(null);
                                    }
                                    setStep(4);
                                }}
                            >
                                Previous
                            </Button>

                            <Button
                                variant="primary"
                                className="flex-1"
                                disabled={!isValid}
                                onClick={() => setShowSuccessModal(true)}
                            >
                                Complete
                            </Button>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}