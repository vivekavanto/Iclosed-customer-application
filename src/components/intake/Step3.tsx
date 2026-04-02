"use client";

import React, { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import AddressAutocomplete from "@/components/intake/AddressAutocomplete";
import { ChevronLeft, ChevronRight, Home, FileText } from "lucide-react";

interface FormData {
  street: string;
  unit: string;
  city: string;
  postalCode: string;
}

interface Step3Props {
  formData: FormData;
  setFormData: (data: FormData) => void;
  sellingFormData: FormData;
  setSellingFormData: (data: FormData) => void;
  selectedClosingOption?: string | null;
  setStep: (step: number) => void;
  step: number;
  agreementSigned: "yes" | "no" | null;
}

function validate(formData: FormData) {
  const errors: Partial<Record<keyof FormData, string>> = {};

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

  const postalRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
  if (!formData.postalCode.trim()) {
    errors.postalCode = "Postal code is required.";
  } else if (!postalRegex.test(formData.postalCode.trim())) {
    errors.postalCode = "Enter a valid Ontario postal code (e.g. M5V 3A8).";
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
  formData: FormData;
  setFormData: (data: FormData) => void;
  touched: Partial<Record<keyof FormData, boolean>>;
  setTouched: React.Dispatch<React.SetStateAction<Partial<Record<keyof FormData, boolean>>>>;
  submitAttempted: boolean;
  prefix: string; // for unique label ids
}) {
  const errors = validate(formData);
  const touch = (field: keyof FormData) =>
    setTouched((prev) => ({ ...prev, [field]: true }));
  const showError = (field: keyof FormData) =>
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

const Step3: React.FC<Step3Props> = ({
  formData,
  setFormData,
  sellingFormData,
  setSellingFormData,
  selectedClosingOption,
  setStep,
  step,
  agreementSigned,
}) => {
  const isBoth = selectedClosingOption === "both";
  const { error: toastError } = useToast();

  const [buyTouched, setBuyTouched] = useState<Partial<Record<keyof FormData, boolean>>>({});
  const [sellTouched, setSellTouched] = useState<Partial<Record<keyof FormData, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const buyErrors = validate(formData);
  const sellErrors = validate(sellingFormData);

  const isValid = isBoth
    ? Object.keys(buyErrors).length === 0 && Object.keys(sellErrors).length === 0
    : Object.keys(buyErrors).length === 0;

  const leftSteps = [
    { id: 1, label: "Select Service" },
    { id: 2, label: "Price" },
    { id: 3, label: "Address" },
    { id: 4, label: "Agreement Signed" },
    ...(agreementSigned === "yes" ? [{ id: 5, label: "Upload Document" }] : []),
    { id: agreementSigned === "yes" ? 6 : 5, label: "Contact Info" },
  ];

  const handleContinue = () => {
    if (!isValid) {
      toastError("Please fill in all required address fields.");
      setSubmitAttempted(true);
      return;
    }
    setStep(4);
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
                {isBoth
                  ? "Enter the addresses of your properties"
                  : "Enter the address of the property"}
              </h1>
              <p className="mt-4 text-gray-500 text-sm leading-relaxed">
                iClosed currently serves Ontario only.
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
                        ${isCompleted ? "bg-gray-300 text-gray-600"
                          : isActive ? "bg-[#C10007] text-white"
                          : "bg-gray-200 text-gray-400"}`}
                    >
                      {item.id}
                    </div>
                    <span
                      className={`text-sm transition-colors
                        ${isActive || isCompleted ? "text-gray-900 font-semibold" : "text-gray-400"}`}
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

            {isBoth ? (
              <>
                {/* Purchasing address */}
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

                {/* Selling address */}
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
              /* Single address form (buying or selling only) */
              <AddressForm
                label={selectedClosingOption === "selling" ? "Selling Property Address" : "Purchasing Property Address"}
                icon={selectedClosingOption === "selling" ? FileText : Home}
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
              <Button onClick={() => setStep(2)} variant="secondary" size="md">
                <ChevronLeft size={16} strokeWidth={2.5} /> Back
              </Button>
              <Button onClick={handleContinue} variant="primary" size="md">
                Continue <ChevronRight size={16} strokeWidth={2.5} />
              </Button>
            </div>

            {/* Mobile fixed bottom buttons */}
            <div className="lg:hidden fixed bottom-0 left-0 w-full px-5 py-4 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] flex gap-3">
              <Button onClick={() => setStep(2)} variant="secondary" size="lg" className="flex-1">
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

export default Step3;
