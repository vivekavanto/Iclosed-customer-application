"use client";

import { useState, useEffect, useRef } from "react";
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
import Step5Contact, {
  CoPersonCard,
  ContactInfo,
  AppliedReferral,
  ReferralAgentInfo,
} from "@/components/intake/Step5Contact";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { BLOB_ACCESS } from "@/lib/blobPrivacy";
import { useToast } from "@/components/ui/Toast";

export default function ServiceSelection() {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedClosingOption, setSelectedClosingOption] = useState<
    string | null
  >(null);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [step, setStep] = useState(1);
  const [apsPurchaseSigned, setApsPurchaseSigned] = useState<"yes" | "no" | null>(null);
  const [apsSaleSigned, setApsSaleSigned] = useState<"yes" | "no" | null>(null);
  const [purchaseFiles, setPurchaseFiles] = useState<File[]>([]);
  const [saleFiles, setSaleFiles] = useState<File[]>([]);

  // Derived for back-compat with Step1/Step2/Step5Contact, which still expect a
  // single agreementSigned signal. "yes" if any active side is signed.
  const agreementSigned: "yes" | "no" | null = (() => {
    const hasYes = apsPurchaseSigned === "yes" || apsSaleSigned === "yes";
    if (hasYes) return "yes";
    const hasNo = apsPurchaseSigned === "no" || apsSaleSigned === "no";
    if (hasNo) return "no";
    return null;
  })();
  const setAgreementSigned = (v: "yes" | "no" | null) => {
    if (v === null) {
      setApsPurchaseSigned(null);
      setApsSaleSigned(null);
    }
  };

  // Pre-fill contact info for logged-in users
  const [authProfile, setAuthProfile] = useState<{
    fullName: string;
    email: string;
    phone: string;
  } | undefined>(undefined);

  // Step 4 (Contact) state lives here so values survive when the user clicks
  // Back to step 3 and returns. Step5Contact owns only its validation UI state.
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    fullName: "",
    email: "",
    phone: "",
  });
  const [coPurchaserCards, setCoPurchaserCards] = useState<CoPersonCard[]>([]);
  const [coSellerCards, setCoSellerCards] = useState<CoPersonCard[]>([]);
  const [referralSource, setReferralSource] = useState("");
  const [referralOther, setReferralOther] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [appliedReferral, setAppliedReferral] = useState<AppliedReferral | null>(null);
  const [referralNoCode, setReferralNoCode] = useState(false);
  const [referralAgent, setReferralAgent] = useState<ReferralAgentInfo>({
    name: "",
    company: "",
    email: "",
    phone: "",
    partnerId: null,
  });
  const [documentUploadChoice, setDocumentUploadChoice] = useState("");
  const authPrefillAppliedRef = useRef(false);

  const router = useRouter();
  const { error: toastError } = useToast();

  useEffect(() => {
    const loadAuthProfile = async () => {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      if (!meRes.ok) return;

      const me = await meRes.json();
      const email = me?.user?.email;
      if (!email) return;

      const res = await fetch("/api/deals", { cache: "no-store" });
      const data = res.ok ? await res.json() : null;
      const first = data?.deals?.[0];

      const serverName = [me.user.first_name, me.user.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

      setAuthProfile({
        fullName:
          serverName ||
          (first ? `${first.first_name ?? ""} ${first.last_name ?? ""}`.trim() : ""),
        email,
        phone: me.user.phone ?? first?.phone ?? "",
      });
    };
    loadAuthProfile();
  }, []);

  // Prefill contact form from the signed-in profile exactly once per page
  // load. Running this here (rather than inside Step5Contact) means the
  // prefill doesn't re-fire if the user navigates Back and forward again,
  // which would overwrite anything they had typed.
  useEffect(() => {
    if (authProfile && !authPrefillAppliedRef.current) {
      setContactInfo({
        fullName: authProfile.fullName,
        email: authProfile.email,
        phone: authProfile.phone,
      });
      authPrefillAppliedRef.current = true;
    }
  }, [authProfile]);

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
    setSellingPrice("");
    setApsPurchaseSigned(null);
    setApsSaleSigned(null);
    setPurchaseFiles([]);
    setSaleFiles([]);
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
    setContactInfo({ fullName: "", email: "", phone: "" });
    setCoPurchaserCards([]);
    setCoSellerCards([]);
    setReferralSource("");
    setReferralOther("");
    setDocumentUploadChoice("");
    authPrefillAppliedRef.current = false;
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
            sellingPrice={sellingPrice}
            setSellingPrice={setSellingPrice}
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
            closingOption={selectedClosingOption as "buying" | "selling" | "both" | null}
            apsPurchaseSigned={apsPurchaseSigned}
            setApsPurchaseSigned={setApsPurchaseSigned}
            apsSaleSigned={apsSaleSigned}
            setApsSaleSigned={setApsSaleSigned}
            purchaseFiles={purchaseFiles}
            setPurchaseFiles={setPurchaseFiles}
            saleFiles={saleFiles}
            setSaleFiles={setSaleFiles}
            setStep={setStep}
            step={step}
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
            contactInfo={contactInfo}
            setContactInfo={setContactInfo}
            coPurchaserCards={coPurchaserCards}
            setCoPurchaserCards={setCoPurchaserCards}
            coSellerCards={coSellerCards}
            setCoSellerCards={setCoSellerCards}
            referralSource={referralSource}
            setReferralSource={setReferralSource}
            referralOther={referralOther}
            setReferralOther={setReferralOther}
            referralCode={referralCode}
            setReferralCode={setReferralCode}
            appliedReferral={appliedReferral}
            setAppliedReferral={setAppliedReferral}
            referralNoCode={referralNoCode}
            setReferralNoCode={setReferralNoCode}
            referralAgent={referralAgent}
            setReferralAgent={setReferralAgent}
            documentUploadChoice={documentUploadChoice}
            setDocumentUploadChoice={setDocumentUploadChoice}
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
                    selling_price: selectedClosingOption === "both" ? sellingPrice : null,

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

                    aps_signed_purchase:
                      apsPurchaseSigned === null ? null : apsPurchaseSigned === "yes",
                    aps_signed_sale:
                      apsSaleSigned === null ? null : apsSaleSigned === "yes",
                    co_persons: contactData.coPersons ?? [],
                    document_upload_mode: contactData.documentUploadMode,
                    document_uploader_co_person_id: contactData.documentUploaderCoPersonId,
                    referral_source: contactData.referralSource || "",
                    partner_id: contactData.partnerId,
                    referral_agent_name: contactData.referralAgentName || "",
                    referral_agent_company: contactData.referralAgentCompany || "",
                    referral_agent_email: contactData.referralAgentEmail || "",
                    referral_agent_phone: contactData.referralAgentPhone || "",
                  }),
                });

                const intakeResult = await intakeResponse.json();

                if (!intakeResult.success) {
                  toastError(intakeResult.error || "Submission failed. Please try again.");
                  return;
                }

                const leadId = intakeResult.lead_id;

                const uploads: Array<{ file: File; side: "purchase" | "sale"; docType: string }> = [];
                if (apsPurchaseSigned === "yes") {
                  for (const file of purchaseFiles) {
                    uploads.push({ file, side: "purchase", docType: "aps_purchase" });
                  }
                }
                if (apsSaleSigned === "yes") {
                  for (const file of saleFiles) {
                    uploads.push({ file, side: "sale", docType: "aps_sale" });
                  }
                }

                for (const u of uploads) {
                  try {
                    const blob = await upload(
                      `corporate-docs/${leadId}/${Date.now()}-${u.file.name}`,
                      u.file,
                      {
                        access: BLOB_ACCESS,
                        handleUploadUrl: "/api/blob/aps-upload",
                        clientPayload: JSON.stringify({
                          lead_id: leadId,
                          doc_type: u.docType,
                        }),
                      }
                    );

                    const metadataResponse = await fetch(
                      "/api/intake/save-aps-metadata",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          lead_id: leadId,
                          doc_type: u.docType,
                          file_name: u.file.name,
                          file_url: blob.url,
                        }),
                      }
                    );

                    const metadataResult = await metadataResponse.json();
                    if (!metadataResult.success) {
                      console.error(`Metadata save failed (${u.side}):`, metadataResult.error);
                      continue;
                    }

                    await fetch("/api/intake/mark-aps-uploaded", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ lead_id: leadId, side: u.side }),
                    });
                  } catch (err) {
                    console.error(`Upload failed (${u.side}):`, err);
                  }
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
                router.push("/");
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
