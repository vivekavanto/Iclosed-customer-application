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
import HorizontalProgress, { type Step } from "@/components/intake/HorizontalProgress";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import DateTimePicker from "@/components/intake/DateTimePicker";
import Modal from "@/components/ui/Modal";

export default function ServiceSelection() {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedClosingOption, setSelectedClosingOption] = useState<string | null>(null);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [step, setStep] = useState(1);
  const [agreementSigned, setAgreementSigned] = useState<"yes" | "no" | null>(null);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: ""
  });

  const services = [
    { id: "closing", title: "Property Closing", description: "Buying or selling a property? We'll guide you through the legal process—start to finish, and beyond.", icon: Home },
    { id: "refinance", title: "Mortgage Refinance", description: "Changing your current mortgage? Count on us to handle the legal side, smoothly and efficiently.", icon: Briefcase },
    { id: "condo", title: "Condo Status Certificate Report", description: "Closing on a condo? We'll review your status certificate thoroughly—at no extra charge.", icon: FileText },
  ];


  const progressSteps: Step[] = [
    { id: 1, label: "Service", status: step === 1 ? "current" : step > 1 ? "complete" : "upcoming" },
    { id: 2, label: "Purchase Price", status: step === 2 ? "current" : step > 2 ? "complete" : "upcoming" },
    { id: 3, label: "Address", status: step === 3 ? "current" : step > 3 ? "complete" : "upcoming" },
    { id: 4, label: "Agreement", status: step === 4 ? "current" : step > 4 ? "complete" : "upcoming" },
    { id: 5, label: "Contact", status: step === 5 ? "current" : "upcoming" },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <main className="flex-grow flex flex-col items-center px-8 ">
        <div className="w-full max-w-7xl mb-8 px-6">
          <HorizontalProgress steps={progressSteps} />
        </div>

        {/* STEP 1: Service Selection */}
        {step === 1 && (
          <div className="max-w-7xl w-full bg-gray-50 rounded-sm shadow-sm border border-gray-200 p-16">
            <div className="mb-16">
              <h1 className="text-4xl font-semibold tracking-tight text-gray-900">How can we assist you today?</h1>
              <p className="mt-4 text-lg text-gray-500 leading-relaxed max-w-2xl">
                Let's start by selecting the service you need so we can get things moving.
              </p>
            </div>
            <div className="space-y-8">
              {services.map((service) => {
                const Icon = service.icon;
                return (
                  <div
                    key={service.id}
                    onClick={() => setSelected(service.id)}
                    className={`cursor-pointer rounded-lg border p-8 flex items-start gap-8 ${selected === service.id ? "border-[#C10007] shadow-xl" : "border-gray-200 hover:shadow-lg"
                      }`}
                  >
                    <div className="flex-shrink-0">
                      <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                        <Icon size={30} className="text-[#C10007]" strokeWidth={1.8} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900">{service.title}</h3>
                      <p className="mt-4 text-gray-500 leading-relaxed max-w-xl">{service.description}</p>
                    </div>
                    <div className="flex items-start pt-2">
                      <div className={`h-6 w-6 rounded-full border flex items-center justify-center transition-all duration-300 ${selected === service.id ? "border-[#C10007] bg-[#C10007]" : "border-gray-300"
                        }`}>
                        {selected === service.id && <Check size={14} className="text-white" strokeWidth={3} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {selected === "closing" && (
              <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    id: "buy",
                    icon: Home,
                    title: "I am buying a property",
                    description:
                      "You're buying a property? We'll handle the legal steps to complete your purchase securely.",
                    price: "$1029",
                  },
                  {
                    id: "sell",
                    icon: FileText,
                    title: "I am selling a property",
                    description:
                      "Selling a property? We'll prepare your documents and manage the legal side of your sale.",
                    price: "$1029",
                  },
                  {
                    id: "both",
                    icon: Repeat,
                    title: "I am buying AND selling a property",
                    description:
                      "Doing both? iClosed will coordinate both ends to ensure a smooth and connected closing.",
                    price: "$1999",
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  const isSelected = selectedClosingOption === card.id;

                  return (
                    <div
                      key={card.id}
                      onClick={() => setSelectedClosingOption(card.id)}
                      className={`
            cursor-pointer rounded-lg p-6 transition-all duration-300 transform
            ${isSelected
                          ? "bg-white border-2 border-[#C10007] shadow-lg"
                          : "bg-gray-50 border border-gray-200 hover:shadow-md hover:-translate-y-0.5"
                        }
          `}
                    >
                      {/* Icon */}
                      <div
                        className={`flex items-center justify-center w-16 h-16 rounded-full mb-4 transition-all duration-300
            ${isSelected
                            ? "bg-gradient-to-tr from-[#FF6B6B] to-[#C10007] text-white"
                            : "bg-red-50 text-[#C10007]"
                          }
          `}
                      >
                        <Icon size={28} strokeWidth={2} />
                      </div>

                      {/* Content */}
                      <h4
                        className={`text-lg font-semibold mb-2 transition-colors duration-300 ${isSelected ? "text-[#C10007]" : "text-gray-900"
                          }`}
                      >
                        {card.title}
                      </h4>

                      <p className={`text-gray-500 mb-4 ${isSelected ? "text-gray-700" : ""}`}>
                        {card.description}
                      </p>

                      <span
                        className={`font-bold text-xl transition-colors duration-300 ${isSelected ? "text-[#C10007]" : "text-gray-900"
                          }`}
                      >
                        {card.price}
                      </span>{" "}
                      + Disbursements
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end mt-16">
              <Button
                disabled={!selected || (selected === "closing" && !selectedClosingOption)}
                onClick={() => setStep(2)}
                className={`px-10 py-3 rounded-sm text-base font-medium transition-all duration-300 selected && (selected !== "closing" || selectedClosingOption)
  ? "bg-[#C10007] text-white"
  : "bg-gray-400 text-gray-400"
                  }`}
              >Next</Button>
            </div>
          </div>
        )}

        {/* STEP 2: Purchase Price */}
        {step === 2 && (
          <div className="mt-8 w-full max-w-7xl mx-auto bg-gray-50 rounded-sm border border-red-100 p-12 shadow-sm">
            <h1 className="text-3xl font-semibold mb-6">Enter the purchase price for the property.</h1>
            <Input label="Purchase Price" type="text" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="$ 1,250,000" className="mb-6" />
            <div className="flex justify-between">
              <Button onClick={() => setStep(1)} className="px-6 py-2 bg-gray-400 rounded-sm cursor-pointer">Previous</Button>
              <Button onClick={() => setStep(3)} disabled={!purchasePrice} className="px-6 py-2 rounded-sm bg-[#C10007] text-white">Next</Button>
            </div>
          </div>
        )}

        {/* STEP 3: Address */}
        {step === 3 && (
          <div className="w-full max-w-7xl bg-gray-50 border border-gray-200 rounded-2xl p-6 sm:p-8 md:p-12 shadow-sm">
            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-8">
              Enter the address of purchase property?
              <small className="text-gray-500 text-sm font-xs">(iClosed currently only serves Ontario)</small>
            </h1>


            {/* FORM GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">

              <Input
                label="Street Address"
                placeholder="Start typing address..."
              />

              <Input
                label="Unit/Apartment/Suite Number"
                placeholder="123"
              />

              <Input
                label="City"
                placeholder="Toronto"
              />

              <Input
                label="Postal Code"
                placeholder="A1C 2B3"
              />

              {/* Province Select */}
              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-sm font-medium text-[var(--color-text-heading)]">
                  Province
                </label>
                <select
                  className="w-full px-4 py-2.5 rounded-sm border text-sm transition-colors duration-150 
          bg-gray-100 border-[var(--color-border)] 
          focus:outline-none focus:ring-2 focus:ring-[#C10007]"
                  defaultValue="Ontario"
                >
                  <option>Ontario</option>
                </select>
              </div>

            </div>

            {/* BUTTONS */}
            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-12">
              <Button
                onClick={() => setStep(2)}
                className="bg-gray-400 w-full sm:w-auto rounded-sm"
              >
                Previous
              </Button>

              <Button
                onClick={() => setStep(4)}
                className="bg-[#C10007] text-white w-full sm:w-auto rounded-sm"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: Agreement Logic */}
        {step === 4 && (
          <div className="w-full max-w-7xl mx-auto">
            {agreementSigned === null && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-12 shadow-sm space-y-6">
                <div className="mb-12">
                  <h1 className="text-3xl font-bold text-gray-900">
                    Have you signed the Agreement of Purchase and Sale?
                  </h1>
                  <p className="mt-4 text-lg text-gray-500">
                    Not sure? It's the legal document that outlines the terms of your deal.
                  </p>
                </div>

                <div
                  onClick={() => setAgreementSigned("yes")}
                  className="cursor-pointer rounded-xl border-2 p-8 flex items-center justify-between transition-all border-gray-200 hover:border-[#C10007]"
                >
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900">Yes</h3>
                    <p className="mt-2 text-gray-500">I've signed the agreement.</p>
                  </div>
                </div>

                <div
                  onClick={() => {
                    setAgreementSigned("no");
                    setStep(5);
                  }}
                  className="cursor-pointer rounded-xl border-2 p-8 flex items-center justify-between transition-all border-gray-200 hover:border-[#C10007]"
                >
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900">No</h3>
                    <p className="mt-2 text-gray-500">I haven't signed it yet.</p>
                  </div>
                </div>

                <div className="flex justify-between mt-12">
                  <Button onClick={() => setStep(3)} className="px-6 py-2 bg-gray-400 rounded-sm cursor-pointer">
                    Previous
                  </Button>
                </div>
              </div>
            )}

            {agreementSigned === "yes" && (
              <div className="bg-gray-50 border border-red-50 rounded-2xl p-12 shadow-sm space-y-8">
                <h1 className="text-3xl font-semibold text-gray-900">
                  Share your Agreement of Purchase and Sale
                </h1>

                <div
                  className="border-2 border-dashed border-gray-200 rounded-2xl p-10 flex flex-col items-center justify-center bg-white cursor-pointer"
                  onClick={() => document.getElementById("file-upload")?.click()}
                >
                  <UploadCloud size={24} className="text-gray-400 mb-4" />
                  <p className="text-gray-600">
                    Click to <span className="text-red-600 font-medium">browse</span> or drag and drop your file
                  </p>
                  <input id="file-upload" type="file" className="hidden" />
                </div>

                <div className="flex justify-between pt-6">
                  <Button onClick={() => setAgreementSigned(null)} className="px-6 py-2 bg-gray-400 rounded-sm cursor-pointer">
                    Previous
                  </Button>
                  <Button onClick={() => setStep(5)} className="px-10 py-2 bg-[#C10007] text-white rounded-md">
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 5*/}
        {step === 5 && (
          <div className="w-full max-w-7xl mx-auto bg-gray-50 border border-gray-200 rounded-2xl p-16 shadow-sm">
            <h1 className="text-3xl font-semibold text-gray-900 mb-10">
              We'll be in touch
            </h1>

            {/* INPUT GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Input label="Full Name" placeholder="John Doe" />
              <Input label="Email Address" placeholder="john@doe.com" />
              <Input label="Phone Number" placeholder="(555)-123-4567" />
            </div>

            {/* ADD CO-PURCHASER BUTTON */}
            <div className="mt-10">
              <Button
                variant="ghost"
                className="
          w-full
          border border-dashed border-red-200
          text-gray-900
          hover:text-[#C10007]
          hover:bg-transparent
        "
              >
                <Plus size={18} />
                Add Co-Purchaser
              </Button>
            </div>
            {agreementSigned === "no" && (
              <div className="mt-16   border-gray-200">
                <div className="bg-white border border-gray-200 rounded-sm overflow-hidden flex flex-col md:flex-row min-h-[500px]">

                  {/* Calendar */}
                  <div className="w-full md:w-1/3 p-8 border-r border-gray-100">
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

                  {/* Calendar component */}
                  <DateTimePicker
                    onChange={(date, time) => {
                      console.log("Selected Date:", date);
                      console.log("Selected Time:", time);
                    }}
                  />
                </div>
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="flex justify-between mt-16">
              <Button
                onClick={() => {
                  if (agreementSigned === "no") {
                    setAgreementSigned(null);
                    setStep(4);
                  } else {
                    setStep(4);
                  }
                }}
                className="px-6 py-2 bg-gray-400 rounded-sm"
              >
                Previous
              </Button>

              <Button
                onClick={() => setShowSuccessModal(true)}
                className="px-12 py-3 bg-[#C10007] text-white rounded-sm font-semibold"
              >
                Complete
              </Button>
            </div>
          </div>
        )}
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
                setStep(1);
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