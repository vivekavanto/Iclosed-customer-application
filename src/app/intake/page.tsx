"use client";

import { useState, useEffect } from "react";
import { Home, Briefcase, FileText } from "lucide-react";
import HorizontalProgress, {
  Step,
  StepStatus,
} from "@/components/intake/HorizontalProgress";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Step1 } from "@/components/intake/Step1";
import Step2 from "@/components/intake/Step2";
import Step4 from "@/components/intake/Step4";
import Step5Contact from "@/components/intake/Step5Contact";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { useToast } from "@/components/ui/Toast";

export default function ServiceSelection() {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedClosingOption, setSelectedClosingOption] = useState<
    string | null
  >(null);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [step, setStep] = useState(1);
  const [agreementSigned, setAgreementSigned] = useState<"yes" | "no" | null>(
    null,
  );
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Pre-fill contact info for logged-in users
  const [authProfile, setAuthProfile] = useState<{
    fullName: string;
    email: string;
    phone: string;
  } | undefined>(undefined);

  const router = useRouter();
  const { error: toastError } = useToast();

  useEffect(() => {
    const loadAuthProfile = async () => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      // Fetch client profile via deals API (returns first_name, last_name, phone)
      const res = await fetch("/api/deals");
      const data = res.ok ? await res.json() : null;
      const first = data?.deals?.[0];

      setAuthProfile({
        fullName: first ? `${first.first_name ?? ""} ${first.last_name ?? ""}`.trim() : "",
        email: user.email,
        phone: first?.phone ?? "",
      });
    };
    loadAuthProfile();
  }, []);

  const getStatus = (currentStep: number, stepId: number): StepStatus => {
    return currentStep === stepId
      ? "current"
      : currentStep > stepId
        ? "complete"
        : "upcoming";
  };

  const [addressData, setAddressData] = useState({
    street: "",
    unit: "",
    city: "",
    postalCode: "",
  });

  const [sellingAddressData, setSellingAddressData] = useState({
    street: "",
    unit: "",
    city: "",
    postalCode: "",
  });

  const services = [
    {
      id: "closing",
      title: "Property Closing",
      description:
        "Buying or selling a property? We'll guide you through the legal process—start to finish, and beyond.",
      icon: Home,
    },
    {
      id: "refinance",
      title: "Mortgage Refinance",
      description:
        "Changing your current mortgage? Count on us to handle the legal side, smoothly and efficiently.",
      icon: Briefcase,
    },
    {
      id: "condo",
      title: "Condo Status Certificate Report",
      description:
        "Closing on a condo? We'll review your status certificate thoroughly—at no extra charge.",
      icon: FileText,
    },
  ];

  const progressSteps: Step[] = [
    { id: 1, label: "Service", status: getStatus(step, 1) },
    { id: 2, label: "Price & Address", status: getStatus(step, 2) },
    { id: 3, label: "Agreement", status: getStatus(step, 3) },
    { id: 4, label: "Contact", status: getStatus(step, 4) },
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
    setSellingAddressData({
      street: "",
      unit: "",
      city: "",
      postalCode: "",
    });
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <main className="flex-grow flex flex-col items-center px-8 ">
        {/* <div className="w-full max-w-7xl mb-8 ">
          <HorizontalProgress steps={progressSteps} />
        </div> */}

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

        {/* STEP 2 — Price & Address */}
        {step === 2 && (
          <Step2
            purchasePrice={purchasePrice}
            setPurchasePrice={setPurchasePrice}
            formData={addressData}
            setFormData={setAddressData}
            sellingFormData={sellingAddressData}
            setSellingFormData={setSellingAddressData}
            selectedClosingOption={selectedClosingOption}
            setStep={setStep}
            step={step}
            agreementSigned={agreementSigned}
          />
        )}

        {/* STEP 3 — Agreement & Upload */}
        {step === 3 && (
          <Step4
            agreementSigned={agreementSigned}
            setAgreementSigned={setAgreementSigned}
            setStep={setStep}
            step={step}
            uploadedFile={uploadedFile}
            setUploadedFile={setUploadedFile}
          />
        )}

        {/* STEP 4 — Contact */}
        {step === 4 ? (
          <Step5Contact
            step={step}
            setStep={setStep}
            agreementSigned={agreementSigned}
            setAgreementSigned={setAgreementSigned}
            setShowSuccessModal={setShowSuccessModal}
            initialData={authProfile}
            selectedClosingOption={selectedClosingOption}
            onComplete={async (contactData) => {
              try {
                const [firstName, ...rest] = contactData.fullName.split(" ");
                const lastName = rest.join(" ");

                const intakeResponse = await fetch("/api/intake", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    first_name: firstName,
                    last_name: lastName || "",
                    email: contactData.email,
                    phone: contactData.phone,

                    service: selected,
                    sub_service: selectedClosingOption,
                    price: purchasePrice,

                    address_street: addressData.street,
                    address_unit: addressData.unit,
                    address_city: addressData.city,
                    address_postal_code: addressData.postalCode,
                    address_province: "Ontario",

                    ...(selectedClosingOption === "both" && {
                      selling_address_street: sellingAddressData.street,
                      selling_address_unit: sellingAddressData.unit,
                      selling_address_city: sellingAddressData.city,
                      selling_address_postal_code:
                        sellingAddressData.postalCode,
                      selling_address_province: "Ontario",
                    }),

                    aps_signed: agreementSigned === "yes",
                    co_persons: contactData.coPersons ?? [],
                    referral_source: contactData.referralSource || "",
                  }),
                });

                const intakeResult = await intakeResponse.json();

                if (!intakeResult.success) {
                  toastError(intakeResult.error || "Submission failed. Please try again.");
                  return;
                }

                const leadId = intakeResult.lead_id;

                // 2️⃣ If user uploaded file, upload it
                if (uploadedFile && agreementSigned === "yes") {
                  const formData = new FormData();
                  formData.append("file", uploadedFile);
                  formData.append("lead_id", leadId);
                  formData.append("doc_type", "aps");

                  const uploadResponse = await fetch("/api/uploadblobstorage", {
                    method: "POST",
                    body: formData,
                  });

                  const uploadResult = await uploadResponse.json();

                  if (!uploadResult.success) {
                    console.error("Upload failed:", uploadResult.error);
                    return;
                  }

                  // Mark aps_uploaded on the lead so the task is auto-completed during conversion
                  await fetch("/api/intake/mark-aps-uploaded", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lead_id: leadId }),
                  });
                }

                // 3️⃣ Success
                setShowSuccessModal(true);
              } catch (error) {
                console.error("Submission failed:", error);
              }
            }}
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
              Your information has been successfully submitted. Our team will
              contact you shortly.
            </p>

            <Button
              onClick={() => {
                setShowSuccessModal(false);
                resetForm();
                router.push("/intake");
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
