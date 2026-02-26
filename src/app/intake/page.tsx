"use client";

import { useState } from "react";
import {
  Home,
  Briefcase,
  FileText,
  Check,
  Repeat,
  UploadCloud,
  Plus,
  ChevronLeft,
  ChevronRight,
  Video,
  Clock
} from "lucide-react";
import HorizontalProgress, { Step, StepStatus } from "@/components/intake/HorizontalProgress";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import DateTimePicker from "@/components/intake/DateTimePicker";
import Modal from "@/components/ui/Modal";
import { Step1 } from "@/components/intake/Step1";
import Step2 from "@/components/intake/Step2";
import Step3 from "@/components/intake/Step3";
import Step4 from "@/components/intake/Step4";
import Step5Upload from "@/components/intake/Step5Upload";
import Step5Contact from "@/components/intake/Step5Contact";
import { useRouter } from "next/navigation";

export default function ServiceSelection() {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedClosingOption, setSelectedClosingOption] = useState<string | null>(null);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [step, setStep] = useState(1);
  const [agreementSigned, setAgreementSigned] = useState<"yes" | "no" | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const router = useRouter();

  const getStatus = (currentStep: number, stepId: number): StepStatus => {
    return currentStep === stepId ? "current" : currentStep > stepId ? "complete" : "upcoming";
  };

  const [addressData, setAddressData] = useState({
    street: "",
    unit: "",
    city: "",
    postalCode: ""
  });

  const services = [
    { id: "closing", title: "Property Closing", description: "Buying or selling a property? We'll guide you through the legal process—start to finish, and beyond.", icon: Home },
    { id: "refinance", title: "Mortgage Refinance", description: "Changing your current mortgage? Count on us to handle the legal side, smoothly and efficiently.", icon: Briefcase },
    { id: "condo", title: "Condo Status Certificate Report", description: "Closing on a condo? We'll review your status certificate thoroughly—at no extra charge.", icon: FileText },
  ];


  const progressSteps: Step[] = [
    { id: 1, label: "Service", status: getStatus(step, 1) },
    { id: 2, label: "Purchase Price", status: getStatus(step, 2) },
    { id: 3, label: "Address", status: getStatus(step, 3) },
    { id: 4, label: "Agreement", status: getStatus(step, 4) },
    ...(agreementSigned === "yes"
      ? [{ id: 5, label: "Upload", status: getStatus(step, 5) }]
      : []),
    { id: agreementSigned === "yes" ? 6 : 5, label: "Contact", status: getStatus(step, agreementSigned === "yes" ? 6 : 5) },
  ];

  const resetForm = () => {
    setStep(1);
    setSelected(null);
    setSelectedClosingOption(null);
    setPurchasePrice("");
    setAgreementSigned(null);
    setUploadedFile(null);
    setAddressData({
      street: "",
      unit: "",
      city: "",
      postalCode: "",
    });
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <main className="flex-grow flex flex-col items-center px-8 ">
        <div className="w-full max-w-7xl mb-8 px-6">
          <HorizontalProgress steps={progressSteps} />
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <Step1
            services={services}
            selected={selected}
            setSelected={setSelected}
            selectedClosingOption={selectedClosingOption}
            setSelectedClosingOption={setSelectedClosingOption}
            setStep={setStep}
            step={step}
            agreementSigned={agreementSigned}
          />
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <Step2
            purchasePrice={purchasePrice}
            setPurchasePrice={setPurchasePrice}
            setStep={setStep}
            step={step}
            agreementSigned={agreementSigned}
          />
        )}

        {/* STEP 3*/}
        {step === 3 && (
          <Step3
            formData={addressData}
            setFormData={setAddressData}
            setStep={setStep}
            step={step}
            agreementSigned={agreementSigned}
          />
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <Step4
            agreementSigned={agreementSigned}
            setAgreementSigned={setAgreementSigned}
            setStep={setStep}
            step={step}
          />
        )}
        {step === 5 && agreementSigned === "yes" && (
          <Step5Upload
            setStep={setStep}
            uploadedFile={uploadedFile}
            setUploadedFile={setUploadedFile}
            agreementSigned={agreementSigned}
            step={step}
          />
        )}

        {(step === 5 && agreementSigned === "no") ||
          (step === 6 && agreementSigned === "yes") ? (
          <Step5Contact
            step={step}
            setStep={setStep}
            agreementSigned={agreementSigned}
            setAgreementSigned={setAgreementSigned}
            setShowSuccessModal={setShowSuccessModal}
          />
        ) : null}

        <Modal
          open={showSuccessModal}
          onClose={() => setShowSuccessModal(false)}
          title="Submission Successful"
          size="md"
        >
          <div className="text-center py-8">

            <div className="flex justify-center mb-6">
              <div className="bg-[#FFE5E6] p-4 rounded-full">
                <svg
                  className="w-8 h-8 text-[#C10007]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>

            <p className="text-[var(--color-text-muted)] mb-8">
              Your information has been successfully submitted.
              Our team will contact you shortly.
            </p>

            <Button
              onClick={() => {
                setShowSuccessModal(false);
                resetForm();
              }}
              className="px-8 py-3 bg-[#C10007] text-white rounded-md hover:opacity-90 transition cursor-pointer"
            >
              Done
            </Button>

          </div>
        </Modal>
      </main>

    </div>
  );
}