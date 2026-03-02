"use client";
import { Home, FileText, Repeat, Check } from "lucide-react";
import Button from "@/components/ui/Button";

interface Service {
  id: string;
  title: string;
  description: string;
  icon: any;
  price?: string;
}

interface Step1Props {
  services: Service[];
  selected: string | null;
  setSelected: (value: string | null) => void;
  selectedClosingOption: string | null;
  setSelectedClosingOption: (value: string | null) => void;
  setStep: (step: number) => void;
  step: number;
  agreementSigned: "yes" | "no" | null;
}

export function Step1({
  services,
  selected,
  setSelected,
  selectedClosingOption,
  setSelectedClosingOption,
  setStep,
  step,
  agreementSigned,
}: Step1Props) {
  const handleNext = () => {
    if (!selected) return alert("Please select a service to continue.");
    if (selected === "closing" && !selectedClosingOption)
      return alert("Please select a closing option.");
    setStep(2);
  };

  const isNextDisabled =
    !selected || (selected === "closing" && !selectedClosingOption);

  const leftSteps = [
    { id: 1, label: "Select Service" },
    { id: 2, label: "Purchase Price" },
    { id: 3, label: "Address" },
    { id: 4, label: "Agreement Signed" },
    ...(agreementSigned === "yes" ? [{ id: 5, label: "Upload Document" }] : []),
    { id: agreementSigned === "yes" ? 6 : 5, label: "Contact Info" },
  ];

  const closingCards = [
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
      title: "I am buying and selling a property",
      description:
        "Doing both? iClosed will coordinate both ends to ensure a smooth and connected closing.",
      price: "$1999",
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row">
        {/* LEFT PANEL */}
        <div className="lg:w-80 xl:w-96 flex-shrink-0 bg-gray-50 lg:sticky lg:top-0 lg:h-screen flex flex-col border-r border-gray-100 p-5 sm:p-8 lg:p-12">
          <div className="flex-1 overflow-y-auto">
            <div className="w-10 h-1 bg-[#C10007] rounded-full mb-10" />

            <div className="mb-6">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#C10007]">
                Step {String(step).padStart(2, "0")}
              </span>
              <h1 className="mt-3 text-xl sm:text-2xl xl:text-3xl font-semibold text-gray-900 leading-snug">
                How can we assist you today?
              </h1>
              <p className="mt-4 text-gray-500 text-sm leading-relaxed">
                Let's start by selecting the service you need so we can get things
                moving.
              </p>
            </div>

            {/* PROGRESS */}
            <div className="hidden lg:block space-y-4 mt-6">
              {leftSteps.map((item) => {
                const isCompleted = item.id < step;
                const isActive = item.id === step;

                return (
                  <div key={item.id} className="flex items-center gap-4">
                    <div
                      className={`h-8 w-8 flex items-center justify-center rounded-full text-sm font-bold flex-shrink-0 transition-all duration-300
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
                      className={`text-sm transition-colors duration-300 ${
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

          {/* NEXT BUTTON */}
          <div className="mt-6 lg:flex-shrink-0">
            {/* Fixed bottom button for small/medium screens */}
            <div className="block lg:hidden fixed bottom-0 left-0 w-full px-6 py-4 bg-gray-50">
              <Button
                onClick={handleNext}
                disabled={isNextDisabled}
                variant="primary"
                size="lg"
                fullWidth
              >
                Next
              </Button>
            </div>

            {/* Original left panel button visible only on lg+ */}
            <div className="hidden lg:block">
              <Button
                onClick={handleNext}
                disabled={isNextDisabled}
                variant="primary"
                size="lg"
                fullWidth
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 p-5 sm:p-10 lg:p-16 pb-28 sm:pb-10 lg:pb-16 overflow-y-auto">
          <div className="max-w-2xl">
            <div className="space-y-3">
              {services.map((service) => {
                const Icon = service.icon;
                const isSelected = selected === service.id;

                return (
                  <div
                    key={service.id}
                    onClick={() => setSelected(service.id)}
                    className={`group cursor-pointer rounded-2xl border p-4 sm:p-6 flex items-start gap-3 sm:gap-5 transition-all duration-300 ease-out
                    ${
                      isSelected
                        ? "bg-white border-[#C10007] shadow-[0_0_0_1px_rgba(193,0,7,0.2),0_8px_32px_rgba(193,0,7,0.08)]"
                        : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm"
                    }`}
                  >
                    <div
                      className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex-shrink-0 flex items-center justify-center transition-all duration-300 ${
                        isSelected
                          ? "bg-[#C10007] shadow-[0_4px_12px_rgba(193,0,7,0.3)]"
                          : "bg-gray-50 group-hover:bg-gray-100"
                      }`}
                    >
                      <Icon
                        size={22}
                        className={isSelected ? "text-white" : "text-gray-500"}
                        strokeWidth={1.8}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-gray-900">
                        {service.title}
                      </h3>
                      <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
                        {service.description}
                      </p>
                    </div>

                    <div
                      className={`h-5 w-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center mt-0.5 transition-all duration-300 ${
                        isSelected ? "border-[#C10007] bg-[#C10007]" : "border-gray-200"
                      }`}
                    >
                      {isSelected && (
                        <Check size={10} className="text-white" strokeWidth={3.5} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {selected === "closing" && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-5">
                  <div className="h-px flex-1 bg-gray-100" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 px-2">
                    Choose your Pricing plan
                  </span>
                  <div className="h-px flex-1 bg-gray-100" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {closingCards.map((card) => {
                    const Icon = card.icon;
                    const isSel = selectedClosingOption === card.id;

                    return (
                      <div
                        key={card.id}
                        onClick={() => setSelectedClosingOption(card.id)}
                        className={`cursor-pointer rounded-xl p-5 transition-all duration-300 ${
                          isSel
                            ? "bg-white border-2 border-[#C10007] shadow-[0_4px_20px_rgba(193,0,7,0.1)]"
                            : "bg-gray-50 border border-gray-100 hover:shadow-sm hover:-translate-y-0.5"
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${
                            isSel ? "bg-gradient-to-tr from-[#FF6B6B] to-[#C10007]" : "bg-red-50"
                          }`}
                        >
                          <Icon
                            size={16}
                            className={isSel ? "text-white" : "text-[#C10007]"}
                            strokeWidth={2}
                          />
                        </div>

                        <h4
                          className={`text-medium font-normal mb-1.5 leading-snug ${
                            isSel ? "text-[#C10007]" : "text-gray-900"
                          }`}
                        >
                          {card.title}
                        </h4>

                        <p className="text-sm text-gray-500 leading-relaxed mb-3">
                          {card.description}
                        </p>

                        <p className={`font-bold ${isSel ? "text-[#C10007]" : "text-gray-900"}`}>
                          {card.price}
                        </p>

                        <p className="text-xs text-gray-400">+ Disbursements</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}