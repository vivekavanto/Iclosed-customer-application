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
}

export default function Step1({
    services,
    selected,
    setSelected,
    selectedClosingOption,
    setSelectedClosingOption,
    setStep,
}: Step1Props) {

    const handleNext = () => {
        if (!selected) {
            alert("Please select a service to continue.");
            return;
        }
        if (selected === "closing" && !selectedClosingOption) {
            alert("Please select a closing option.");
            return;
        }
        setStep(2);
    };

    const isNextDisabled = !selected || (selected === "closing" && !selectedClosingOption);
    return (
        <div className="max-w-7xl w-full bg-gray-50 rounded-sm shadow-xl border border-gray-200 p-16">
            <div className="mb-16">
                <h1 className="text-4xl font-semibold tracking-tight text-gray-900">
                    How can we assist you today?
                </h1>
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
                            className={`cursor-pointer bg-white rounded-sm border p-8 flex items-start gap-8 ${selected === service.id ? "border-[#C10007] shadow-2xl" : "border-gray-200 hover:shadow-xl"
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
                                <div
                                    className={`h-6 w-6 rounded-full border flex items-center justify-center transition-all duration-300 ${selected === service.id ? "border-[#C10007] bg-[#C10007]" : "border-gray-300"
                                        }`}
                                >
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
                            description: "You're buying a property? We'll handle the legal steps to complete your purchase securely.",
                            price: "$1029",
                        },
                        {
                            id: "sell",
                            icon: FileText,
                            title: "I am selling a property",
                            description: "Selling a property? We'll prepare your documents and manage the legal side of your sale.",
                            price: "$1029",
                        },
                        {
                            id: "both",
                            icon: Repeat,
                            title: "I am buying AND selling a property",
                            description: "Doing both? iClosed will coordinate both ends to ensure a smooth and connected closing.",
                            price: "$1999",
                        },
                    ].map((card) => {
                        const Icon = card.icon;
                        const isSelected = selectedClosingOption === card.id;

                        return (
                            <div
                                key={card.id}
                                onClick={() => setSelectedClosingOption(card.id)}
                                className={`cursor-pointer rounded-lg p-6 transition-all duration-300 transform ${isSelected
                                    ? "bg-white border-2 border-[#C10007] shadow-lg"
                                    : "bg-gray-50 border border-gray-200 hover:shadow-md hover:-translate-y-0.5"
                                    }`}
                            >
                                <div
                                    className={`flex items-center justify-center w-16 h-16 rounded-full mb-4 transition-all duration-300 ${isSelected ? "bg-gradient-to-tr from-[#FF6B6B] to-[#C10007] text-white" : "bg-red-50 text-[#C10007]"
                                        }`}
                                >
                                    <Icon size={28} strokeWidth={2} />
                                </div>

                                <h4 className={`text-lg font-semibold mb-2 transition-colors duration-300 ${isSelected ? "text-[#C10007]" : "text-gray-900"}`}>
                                    {card.title}
                                </h4>
                                <p className={`text-gray-500 mb-4 ${isSelected ? "text-gray-700" : ""}`}>{card.description}</p>
                                <span className={`font-bold text-xl transition-colors duration-300 ${isSelected ? "text-[#C10007]" : "text-gray-900"}`}>
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
                    onClick={handleNext}
                    disabled={!selected || (selected === "closing" && !selectedClosingOption)}
                    className="px-10 py-3 rounded-sm text-base font-medium bg-[#C10007] text-white disabled:bg-gray-400 disabled:text-gray-700"
                >
                    Next
                </Button>
            </div>
        </div>
    );
}