"use client";

import React, { useState, useEffect } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import AddressAutocomplete from "@/components/intake/AddressAutocomplete";
import { ChevronLeft, ChevronRight, Home, FileText } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface AddressData {
    street: string;
    unit: string;
    city: string;
    postalCode: string;
}

interface Step2Props {
    purchasePrice: string;
    setPurchasePrice: (value: string) => void;
    formData: AddressData;
    setFormData: (data: AddressData) => void;
    sellingFormData: AddressData;
    setSellingFormData: (data: AddressData) => void;
    selectedClosingOption: string | null;
    setStep: (step: number) => void;
    step: number;
    agreementSigned: "yes" | "no" | null;
}

function validateAddress(formData: AddressData) {
    const errors: Partial<Record<keyof AddressData, string>> = {};

    if (!formData.street.trim()) {
        errors.street = "Street address is required.";
    }

    if (!formData.city.trim()) {
        errors.city = "City is required.";
    } else if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s''-]+$/.test(formData.city.trim())) {
        errors.city = "City name is not valid.";
    } else if (formData.city.trim().length < 2) {
        errors.city = "City name is too short.";
    }

    const postalRegex = /^[A-Za-z]\d[A-Za-z]([ -]?\d[A-Za-z]\d)?$/;
    if (!formData.postalCode.trim()) {
        errors.postalCode = "Postal code is required.";
    } else if (!postalRegex.test(formData.postalCode.trim())) {
        errors.postalCode = "Enter a valid postal code (e.g. M5V 3A8 or M5V).";
    }

    if (formData.unit.trim()) {
        if (!/^[A-Za-z0-9-]+$/.test(formData.unit.trim())) {
            errors.unit = "Unit can only contain letters, numbers, or hyphens.";
        } else if (formData.unit.trim().length > 10) {
            errors.unit = "Unit number is too long.";
        }
    }

    return errors;
}

/* ── Reusable address form block ── */
function AddressForm({
    label,
    icon: Icon,
    formData,
    setFormData,
    touched,
    setTouched,
    submitAttempted,
    prefix,
}: {
    label: string;
    icon: React.ElementType;
    formData: AddressData;
    setFormData: (data: AddressData) => void;
    touched: Partial<Record<keyof AddressData, boolean>>;
    setTouched: React.Dispatch<React.SetStateAction<Partial<Record<keyof AddressData, boolean>>>>;
    submitAttempted: boolean;
    prefix: string;
}) {
    const errors = validateAddress(formData);
    const touch = (field: keyof AddressData) =>
        setTouched((prev) => ({ ...prev, [field]: true }));
    const showError = (field: keyof AddressData) =>
        touched[field] || submitAttempted ? errors[field] : undefined;

    return (
        <div className="space-y-4">
            {/* Section heading */}
            <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
                <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
                    <Icon size={15} className="text-[#C10007]" strokeWidth={2} />
                </div>
                <p className="text-sm font-semibold text-gray-900">{label}</p>
            </div>

            {/* Street */}
            <div className="flex flex-col gap-1.5 w-full">
                <label className="text-sm font-medium text-[var(--color-text-heading)]">
                    Street Address <span className="text-red-600 ml-1">*</span>
                </label>
                <AddressAutocomplete
                    value={formData.street}
                    onChange={(val) => setFormData({ ...formData, street: val })}
                    onSelect={({ street, city, postalCode }) =>
                        setFormData({
                            ...formData,
                            street,
                            city: city || formData.city,
                            postalCode: postalCode || formData.postalCode,
                        })
                    }
                    onBlur={() => touch("street")}
                    hasError={!!showError("street")}
                />
                {showError("street") && (
                    <p className="text-xs text-red-600 mt-0.5">{showError("street")}</p>
                )}
            </div>

            {/* Unit */}
            <Input
                label="Unit / Apartment / Suite"
                id={`${prefix}-unit`}
                placeholder="e.g. 4B"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                onBlur={() => touch("unit")}
                error={showError("unit")}
            />

            {/* City */}
            <Input
                label="City"
                id={`${prefix}-city`}
                placeholder="Toronto"
                required
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                onBlur={() => touch("city")}
                error={showError("city")}
            />

            {/* Postal Code */}
            <Input
                label="Postal Code"
                id={`${prefix}-postal`}
                placeholder="M5V 3A8"
                required
                value={formData.postalCode}
                onChange={(e) =>
                    setFormData({ ...formData, postalCode: e.target.value.toUpperCase() })
                }
                onBlur={() => touch("postalCode")}
                error={showError("postalCode")}
            />

            {/* Province (locked) */}
            <div className="flex flex-col gap-1.5 w-full">
                <label className="text-sm font-medium text-gray-900">Province</label>
                <select
                    className="w-full px-4 py-2.5 rounded-sm border text-sm bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed"
                    defaultValue="Ontario"
                    disabled
                >
                    <option>Ontario</option>
                </select>
            </div>
        </div>
    );
}

const Step2: React.FC<Step2Props> = ({
    purchasePrice,
    setPurchasePrice,
    formData,
    setFormData,
    sellingFormData,
    setSellingFormData,
    selectedClosingOption,
    setStep,
    step,
    agreementSigned,
}) => {
    const isSelling = selectedClosingOption === "selling";
    const isBoth = selectedClosingOption === "both";
    const priceLabel = isSelling ? "Sale Price" : "Purchase Price";
    const { error: toastError } = useToast();

    // Price validation
    const [priceValid, setPriceValid] = useState(false);
    const [priceError, setPriceError] = useState("");

    useEffect(() => {
        const numericValue = parseFloat(
            purchasePrice.replace(/[^0-9.]/g, "")
        );

        const MIN_PRICE = 10000;
        const MAX_PRICE = 10000000;

        if (purchasePrice.trim() === "") {
            setPriceError("");
            setPriceValid(false);
        } else if (isNaN(numericValue)) {
            setPriceError("Please enter a valid amount.");
            setPriceValid(false);
        } else if (numericValue < MIN_PRICE) {
            setPriceError("Property price must be at least $10,000.");
            setPriceValid(false);
        } else if (numericValue > MAX_PRICE) {
            setPriceError("Property price cannot exceed $10,000,000.");
            setPriceValid(false);
        } else {
            setPriceError("");
            setPriceValid(true);
        }
    }, [purchasePrice]);

    // Address validation
    const [buyTouched, setBuyTouched] = useState<Partial<Record<keyof AddressData, boolean>>>({});
    const [sellTouched, setSellTouched] = useState<Partial<Record<keyof AddressData, boolean>>>({});
    const [submitAttempted, setSubmitAttempted] = useState(false);

    const buyErrors = validateAddress(formData);
    const sellErrors = validateAddress(sellingFormData);

    // Check if buying and selling addresses are the same
    const sameAddressError = isBoth
        && formData.street.trim().toLowerCase() === sellingFormData.street.trim().toLowerCase()
        && formData.city.trim().toLowerCase() === sellingFormData.city.trim().toLowerCase()
        && formData.postalCode.trim().toLowerCase().replace(/\s/g, "") === sellingFormData.postalCode.trim().toLowerCase().replace(/\s/g, "")
        && formData.street.trim() !== ""
        && formData.city.trim() !== ""
        && formData.postalCode.trim() !== "";

    const addressValid = isBoth
        ? Object.keys(buyErrors).length === 0 && Object.keys(sellErrors).length === 0 && !sameAddressError
        : Object.keys(buyErrors).length === 0;

    const isValid = priceValid && addressValid;

    const leftSteps = [
        { id: 1, label: "Select Service" },
        { id: 2, label: "Price & Address" },
        { id: 3, label: "Agreement" },
        { id: 4, label: "Contact Info" },
    ];

    const formatCurrency = (value: string) => {
        const numeric = value.replace(/[^0-9]/g, "");
        if (!numeric) return "";
        const formatted = new Intl.NumberFormat("en-US").format(
            parseInt(numeric, 10)
        );
        return `$${formatted}`;
    };

    const handleContinue = () => {
        if (sameAddressError) {
            toastError("The purchasing and selling property addresses cannot be the same.");
            return;
        }
        if (!priceValid) {
            toastError(priceError || "Please enter a valid price.");
            setSubmitAttempted(true);
            return;
        }
        if (!addressValid) {
            toastError("Please fill in all required address fields.");
            setSubmitAttempted(true);
            return;
        }
        if (!isValid) {
            setSubmitAttempted(true);
            return;
        }
        setStep(3);
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
                                Enter price & address
                            </h1>
                            <p className="mt-4 text-gray-500 text-sm leading-relaxed">
                                Provide the {priceLabel.toLowerCase()} and the property address to continue.
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
                </div>

                {/* RIGHT PANEL */}
                <div className="flex-1 p-6 sm:p-10 lg:p-16 pb-28 lg:pb-16 overflow-y-auto">
                    <div className="space-y-8 w-full max-w-2xl">

                        {/* Price Section */}
                        <div>
                            <h2 className="text-3xl font-semibold mb-6">
                                Enter the {priceLabel.toLowerCase()} for the property.
                            </h2>

                            <Input
                                label={priceLabel}
                                required
                                type="text"
                                value={purchasePrice}
                                onChange={(e) => {
                                    const formattedValue = formatCurrency(e.target.value);
                                    setPurchasePrice(formattedValue);
                                }}
                                placeholder="$1,250,000"
                                className="mb-2"
                            />

                            {priceError && (
                                <p className="text-sm text-red-600">{priceError}</p>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="border-t border-gray-200" />

                        {/* Address Section */}
                        {isBoth ? (
                            <>
                                <AddressForm
                                    label="Purchasing Property Address"
                                    icon={Home}
                                    formData={formData}
                                    setFormData={setFormData}
                                    touched={buyTouched}
                                    setTouched={setBuyTouched}
                                    submitAttempted={submitAttempted}
                                    prefix="buy"
                                />

                                <div className="border-t border-dashed border-gray-200" />

                                <AddressForm
                                    label="Selling Property Address"
                                    icon={FileText}
                                    formData={sellingFormData}
                                    setFormData={setSellingFormData}
                                    touched={sellTouched}
                                    setTouched={setSellTouched}
                                    submitAttempted={submitAttempted}
                                    prefix="sell"
                                />

                            </>
                        ) : (
                            <AddressForm
                                label={isSelling ? "Selling Property Address" : "Purchasing Property Address"}
                                icon={isSelling ? FileText : Home}
                                formData={formData}
                                setFormData={setFormData}
                                touched={buyTouched}
                                setTouched={setBuyTouched}
                                submitAttempted={submitAttempted}
                                prefix="main"
                            />
                        )}

                        {/* Desktop button row */}
                        <div className="hidden lg:flex items-center justify-between pt-6 border-t border-gray-100">
                            <Button onClick={() => setStep(1)} variant="secondary" size="md">
                                <ChevronLeft size={16} strokeWidth={2.5} /> Back
                            </Button>
                            <Button onClick={handleContinue} variant="primary" size="md">
                                Continue <ChevronRight size={16} strokeWidth={2.5} />
                            </Button>
                        </div>

                        {/* Mobile fixed bottom buttons */}
                        <div className="lg:hidden fixed bottom-0 left-0 w-full px-5 py-4 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] flex gap-3">
                            <Button onClick={() => setStep(1)} variant="secondary" size="lg" className="flex-1">
                                <ChevronLeft size={18} strokeWidth={2.5} /> Back
                            </Button>
                            <Button onClick={handleContinue} variant="primary" size="lg" className="flex-1">
                                Continue <ChevronRight size={18} strokeWidth={2.5} />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Step2;
