"use client";

import { Plus, ChevronLeft, CheckCircle2, Trash2, User, Users } from "lucide-react";
import React from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

interface ContactData {
    fullName: string;
    email: string;
    phone: string;
    meetingDate: Date | null;
    meetingTime: string | null;
    coPersons: CoPerson[];
    referralSource: string;
}

interface CoPerson {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    // Which stack the entry came from on the intake form. The intake API
    // persists this so the admin panel can label P&S co-persons correctly.
    role: "purchaser" | "seller";
}

interface CoPersonCard {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    errors: { fullName?: string; email?: string; phone?: string };
    touched: { fullName?: boolean; email?: boolean; phone?: boolean };
}

const makeEmptyCard = (): CoPersonCard => ({
    id: crypto.randomUUID(),
    fullName: "",
    email: "",
    phone: "",
    errors: {},
    touched: {},
});

interface Step5ContactProps {
    setStep: (step: number) => void;
    agreementSigned: "yes" | "no" | null;
    setAgreementSigned: (value: "yes" | "no" | null) => void;
    setShowSuccessModal: (show: boolean) => void;
    step: number;
    onComplete: (data: ContactData) => Promise<void> | void;
    /** Pre-fill contact fields when user is already logged in */
    initialData?: { fullName: string; email: string; phone: string };
    /** Determines which co-person sections render: buying→Co-Purchaser, selling→Co-Seller, both→both sections */
    selectedClosingOption?: string | null;
}

export default function Step5Contact({
    setStep,
    agreementSigned,
    setAgreementSigned,
    setShowSuccessModal,
    step,
    onComplete,
    initialData,
    selectedClosingOption,
}: Step5ContactProps) {
    const isBoth = selectedClosingOption === "both";
    const isSelling = selectedClosingOption === "selling";
    const showPurchaserStack = isBoth || !isSelling;
    const showSellerStack = isBoth || isSelling;
    const { error: toastError } = useToast();

    // ── Co-person state ──
    const [submitting, setSubmitting] = React.useState(false);
    const [coPurchaserCards, setCoPurchaserCards] = React.useState<CoPersonCard[]>(() => []);
    const [coSellerCards, setCoSellerCards] = React.useState<CoPersonCard[]>(() => []);

    const formatCoPhone = (value: string): string => {
        const digits = value.replace(/\D/g, "").slice(0, 10);
        if (digits.length <= 3) return digits.length ? `(${digits}` : "";
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    };

    const validateCoCard = (card: CoPersonCard): { fullName?: string; email?: string; phone?: string } => {
        const errs: { fullName?: string; email?: string; phone?: string } = {};
        if (!card.fullName.trim()) errs.fullName = "Full name is required.";
        else if (!/^[A-Za-z\s]+$/.test(card.fullName.trim())) errs.fullName = "Name can only contain letters.";
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!card.email.trim()) errs.email = "Email is required.";
        else if (!emailRegex.test(card.email.trim())) errs.email = "Enter a valid email address.";
        const phoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;
        if (!card.phone.trim()) errs.phone = "Phone number is required.";
        else if (!phoneRegex.test(card.phone.trim())) errs.phone = "Enter phone in (416) 555-1234 format.";
        return errs;
    };

    const isCardEmpty = (card: CoPersonCard): boolean => {
        return !card.fullName.trim() && !card.email.trim() && !card.phone.trim();
    };

    const getSetter = (which: "purchaser" | "seller") =>
        which === "purchaser" ? setCoPurchaserCards : setCoSellerCards;

    const updateCoCard = (which: "purchaser" | "seller", id: string, field: 'fullName' | 'email' | 'phone', value: string) => {
        getSetter(which)(prev => prev.map(card => {
            if (card.id !== id) return card;
            const updated = { ...card, [field]: value };
            if (card.touched[field]) {
                updated.errors = validateCoCard(updated);
            }
            return updated;
        }));
    };

    const touchCoCardField = (which: "purchaser" | "seller", id: string, field: 'fullName' | 'email' | 'phone') => {
        getSetter(which)(prev => prev.map(card => {
            if (card.id !== id) return card;
            const updated = { ...card, touched: { ...card.touched, [field]: true } };
            updated.errors = validateCoCard(updated);
            return updated;
        }));
    };

    const handleAddCoPersonCard = (which: "purchaser" | "seller") => {
        getSetter(which)(prev => [...prev, makeEmptyCard()]);
    };

    const handleRemoveCoPersonCard = (which: "purchaser" | "seller", id: string) => {
        getSetter(which)(prev => prev.filter(p => p.id !== id));
    };

    const leftSteps = [
        { id: 1, label: "Select Service" },
        { id: 2, label: "Price & Address" },
        { id: 3, label: "Agreement" },
        { id: 4, label: "Contact Info" },
    ];

    const formatPhone = (value: string): string => {
        const digits = value.replace(/\D/g, "").slice(0, 10);
        if (digits.length <= 3) return digits.length ? `(${digits}` : "";
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    };

    const REFERRAL_OPTIONS = [
        "Real estate agent",
        "Mortgage broker",
        "Friend or family member",
        "Online search",
        "Repeat client",
        "Other",
    ];
    const [referralSource, setReferralSource] = React.useState("");
    const [referralOther, setReferralOther] = React.useState("");

    const [isValid, setIsValid] = React.useState(false);
    const [formData, setFormData] = React.useState({
        fullName: initialData?.fullName ?? "",
        email: initialData?.email ?? "",
        phone: initialData?.phone ?? "",
    });

    const isLoggedIn = !!initialData?.email;
    const initialDataAppliedRef = React.useRef(false);

    // Sync pre-fill when auth data loads asynchronously — but only ONCE so
    // we never overwrite values the user has already typed.
    React.useEffect(() => {
        if (initialData && !initialDataAppliedRef.current) {
            setFormData({
                fullName: initialData.fullName,
                email: initialData.email,
                phone: initialData.phone,
            });
            initialDataAppliedRef.current = true;
        }
    }, [initialData?.fullName, initialData?.email, initialData?.phone]);

    const [errors, setErrors] = React.useState<{
        fullName?: string;
        email?: string;
        phone?: string;
    }>({});

    const [touched, setTouched] = React.useState<{
        fullName?: boolean;
        email?: boolean;
        phone?: boolean;
    }>({});

    const isCompleteEnabled = isValid;

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

        const phoneFormatRegex = /^\(\d{3}\) \d{3}-\d{4}$/;
        if (!formData.phone.trim()) {
            newErrors.phone = "Phone number is required.";
        } else if (!phoneFormatRegex.test(formData.phone.trim())) {
            newErrors.phone = "Enter a valid phone number in (416) 555-1234 format.";
        }

        setErrors(newErrors);
        setIsValid(Object.keys(newErrors).length === 0);
    }, [formData]);

    const handleComplete = async () => {
        if (!isCompleteEnabled) {
            setTouched({ fullName: true, email: true, phone: true });
            const firstError = errors.fullName || errors.email || errors.phone;
            toastError(firstError || "Please fill in all required fields.");
            return;
        }

        // Validate partially filled co-person cards across both stacks
        let hasCoErrors = false;
        const validateStack = (cards: CoPersonCard[]) => cards.map(card => {
            // Skip completely empty cards — they're optional
            if (isCardEmpty(card)) return card;
            const cardErrors = validateCoCard(card);
            if (Object.keys(cardErrors).length > 0) {
                hasCoErrors = true;
                return {
                    ...card,
                    errors: cardErrors,
                    touched: { fullName: true, email: true, phone: true },
                };
            }
            return card;
        });

        const updatedPurchaserCards = validateStack(coPurchaserCards);
        const updatedSellerCards = validateStack(coSellerCards);

        if (hasCoErrors) {
            if (showPurchaserStack) setCoPurchaserCards(updatedPurchaserCards);
            if (showSellerStack) setCoSellerCards(updatedSellerCards);
            toastError("Please complete all co-person information or remove empty cards.");
            return;
        }

        // Collect valid co-persons from active stacks only — tag each one with
        // the role it was entered under so the backend can store it.
        const cardToCoPerson = (role: "purchaser" | "seller") => (card: CoPersonCard): CoPerson => ({
            id: card.id,
            fullName: card.fullName,
            email: card.email,
            phone: card.phone,
            role,
        });
        const coPersons: CoPerson[] = [
            ...(showPurchaserStack ? coPurchaserCards.filter(c => !isCardEmpty(c)).map(cardToCoPerson("purchaser")) : []),
            ...(showSellerStack ? coSellerCards.filter(c => !isCardEmpty(c)).map(cardToCoPerson("seller")) : []),
        ];

        const finalReferral = referralSource === "Other" ? referralOther.trim() : referralSource;
        setSubmitting(true);
        try {
            await onComplete({ ...formData, meetingDate: null, meetingTime: null, coPersons, referralSource: finalReferral });
        } finally {
            setSubmitting(false);
        }
    };

    const renderCoSection = (which: "purchaser" | "seller") => {
        const cards = which === "purchaser" ? coPurchaserCards : coSellerCards;
        const labelShort = which === "purchaser" ? "Co-Purchaser" : "Co-Seller";
        const sectionTitle = which === "purchaser" ? "Co-Purchaser Information" : "Co-Seller Information";
        const hasCards = cards.length > 0;

        // When no cards exist, show only a simple add button without the bordered card
        if (!hasCards) {
            return (
                <Button
                    variant="ghost"
                    className="w-full border border-dashed border-gray-300 text-gray-600 hover:text-[#C10007] hover:border-red-200 hover:bg-transparent py-4"
                    onClick={() => handleAddCoPersonCard(which)}
                >
                    <Plus size={18} />
                    Add {labelShort}
                </Button>
            );
        }

        // When cards exist, show the full bordered card UI
        return (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
                {/* Card header with light red background */}
                <div className="bg-[#FEF2F2] px-5 py-4 flex items-center gap-3 border-b border-gray-200">
                    <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Users size={18} className="text-[#C10007]" strokeWidth={2} />
                    </div>
                    <p className="text-base font-semibold text-gray-900">{sectionTitle}</p>
                </div>

                {/* Card body */}
                <div className="px-5 py-5 space-y-4 bg-white">
                    {cards.map((card, index) => (
                        <div key={card.id} className="rounded-lg border border-gray-200 p-4 sm:p-5 space-y-4 bg-gray-50 relative">
                            {/* Card number badge and remove button */}
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    {labelShort} {index + 1}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveCoPersonCard(which, card.id)}
                                    className="cursor-pointer w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 hover:text-[#C10007] hover:border-red-200 transition-colors"
                                    aria-label={`Remove ${labelShort.toLowerCase()}`}
                                >
                                    <Trash2 size={12} strokeWidth={2} />
                                </button>
                            </div>

                            {/* Full Name */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                                    Full Name <span className="text-[#C10007]">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="John Doe"
                                    value={card.fullName}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\b\w/g, (c) => c.toUpperCase());
                                        updateCoCard(which, card.id, 'fullName', val);
                                    }}
                                    onBlur={() => touchCoCardField(which, card.id, 'fullName')}
                                    className={`w-full px-4 py-3 text-sm rounded-lg border outline-none transition-colors bg-white ${card.touched.fullName && card.errors.fullName ? "border-[#C10007] ring-2 ring-[#C10007]/10" : "border-gray-200 focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10"}`}
                                />
                                {card.touched.fullName && card.errors.fullName && <p className="mt-1 text-xs text-[#C10007]">{card.errors.fullName}</p>}
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                                    Email Address <span className="text-[#C10007]">*</span>
                                </label>
                                <input
                                    type="email"
                                    placeholder="john@doe.com"
                                    value={card.email}
                                    onChange={(e) => updateCoCard(which, card.id, 'email', e.target.value)}
                                    onBlur={() => touchCoCardField(which, card.id, 'email')}
                                    className={`w-full px-4 py-3 text-sm rounded-lg border outline-none transition-colors bg-white ${card.touched.email && card.errors.email ? "border-[#C10007] ring-2 ring-[#C10007]/10" : "border-gray-200 focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10"}`}
                                />
                                {card.touched.email && card.errors.email && <p className="mt-1 text-xs text-[#C10007]">{card.errors.email}</p>}
                            </div>

                            {/* Phone */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                                    Phone Number <span className="text-[#C10007]">*</span>
                                </label>
                                <div className={`flex items-center border rounded-lg overflow-hidden transition-colors bg-white ${card.touched.phone && card.errors.phone ? "border-[#C10007] ring-2 ring-[#C10007]/10" : "border-gray-200 focus-within:border-[#C10007] focus-within:ring-2 focus-within:ring-[#C10007]/10"}`}>
                                    <span className="flex items-center gap-1.5 px-3 py-3 text-sm text-gray-500 border-r border-gray-200 bg-gray-50 flex-shrink-0">
                                        +1
                                    </span>
                                    <input
                                        type="tel"
                                        placeholder="(555)-123-4567"
                                        value={card.phone}
                                        onChange={(e) => updateCoCard(which, card.id, 'phone', formatCoPhone(e.target.value))}
                                        onBlur={() => touchCoCardField(which, card.id, 'phone')}
                                        className="flex-1 px-3 py-3 text-sm outline-none bg-white"
                                    />
                                </div>
                                {card.touched.phone && card.errors.phone && <p className="mt-1 text-xs text-[#C10007]">{card.errors.phone}</p>}
                            </div>
                        </div>
                    ))}

                    {/* Add button */}
                    <Button
                        variant="ghost"
                        className="w-full border border-dashed border-red-200 text-gray-900 hover:text-[#C10007] hover:bg-transparent"
                        onClick={() => handleAddCoPersonCard(which)}
                    >
                        <Plus size={18} />
                        Add {labelShort}
                    </Button>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-white w-full">
            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row">

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
                                Fill in your contact details.
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

                </div>

                {/* RIGHT PANEL */}
                <div className="flex-1 p-6 sm:p-10 lg:p-16 pb-28 lg:pb-16 overflow-y-auto">
                    <div className="space-y-8 w-full max-w-2xl">

                        {/* Page heading */}
                        <div>
                            <h2 className="text-3xl font-semibold mb-2">Contact Info</h2>
                            <p className="text-gray-500 text-sm">
                                Provide your contact details and any additional parties involved.
                            </p>
                        </div>

                        {/* Your Information Card */}
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                            {/* Card header with light red background */}
                            <div className="bg-[#FEF2F2] px-5 py-4 flex items-center gap-3 border-b border-gray-200">
                                <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                                    <User size={18} className="text-[#C10007]" strokeWidth={2} />
                                </div>
                                <p className="text-base font-semibold text-gray-900">Your Information</p>
                            </div>

                            {/* Card body */}
                            <div className="px-5 py-5 space-y-4 bg-white">
                                {/* Logged-in notice — primary contact is locked to the signed-in account */}
                                {isLoggedIn && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
                                        <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="8" x2="12" y2="12" />
                                                <line x1="12" y1="16" x2="12.01" y2="16" />
                                            </svg>
                                        </div>
                                        <div className="text-[13px] leading-relaxed text-amber-900">
                                            You are submitting as{" "}
                                            <strong>{formData.fullName || initialData?.fullName || "your account"}</strong>.
                                            To submit for someone else, please log out first and start a new intake.
                                        </div>
                                    </div>
                                )}

                                {/* Contact Form */}
                                <Input
                                    label="Full Name"
                                    required
                                    placeholder="John Doe"
                                    value={formData.fullName}
                                    disabled={isLoggedIn}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const capitalized = val.replace(/\b\w/g, (c) => c.toUpperCase());
                                        setFormData({ ...formData, fullName: capitalized });
                                    }}
                                    onBlur={() =>
                                        setTouched((prev) => ({ ...prev, fullName: true }))
                                    }
                                    className={isLoggedIn ? "bg-gray-50 cursor-not-allowed" : ""}
                                />
                                {touched.fullName && errors.fullName && (
                                    <p className="text-red-600 text-sm mt-1">{errors.fullName}</p>
                                )}

                                <Input
                                    label="Email Address"
                                    required
                                    placeholder="john@doe.com"
                                    value={formData.email}
                                    disabled={isLoggedIn}
                                    onChange={(e) =>
                                        setFormData({ ...formData, email: e.target.value })
                                    }
                                    onBlur={() =>
                                        setTouched((prev) => ({ ...prev, email: true }))
                                    }
                                    className={isLoggedIn ? "bg-gray-50 cursor-not-allowed" : ""}
                                />
                                {touched.email && errors.email && (
                                    <p className="text-red-600 text-sm mt-1">{errors.email}</p>
                                )}

                                <Input
                                    label="Phone Number"
                                    required
                                    placeholder="(416) 555-1234"
                                    value={formData.phone}
                                    disabled={isLoggedIn}
                                    onChange={(e) =>
                                        setFormData({ ...formData, phone: formatPhone(e.target.value) })
                                    }
                                    onBlur={() =>
                                        setTouched((prev) => ({ ...prev, phone: true }))
                                    }
                                    className={isLoggedIn ? "bg-gray-50 cursor-not-allowed" : ""}
                                />
                                {touched.phone && errors.phone && (
                                    <p className="text-red-600 text-sm mt-1">{errors.phone}</p>
                                )}
                            </div>
                        </div>

                        {/* Co-person sections — for Purchase & Sale render BOTH co-purchaser and co-seller stacks, otherwise just the matching one */}
                        {isBoth ? (
                            <div className="space-y-5">
                                {renderCoSection("purchaser")}
                                {renderCoSection("seller")}
                            </div>
                        ) : isSelling ? (
                            renderCoSection("seller")
                        ) : (
                            renderCoSection("purchaser")
                        )}

                        {/* How did you hear about us? (optional) */}
                        <div className="flex flex-col gap-1.5 w-full">
                            <label className="text-sm font-medium text-gray-900">
                                How did you hear about us?{" "}
                                <span className="text-gray-400 font-normal">(optional)</span>
                            </label>
                            <select
                                value={referralSource}
                                onChange={(e) => {
                                    setReferralSource(e.target.value);
                                    if (e.target.value !== "Other") setReferralOther("");
                                }}
                                className="w-full px-4 py-2.5 rounded-sm border text-sm border-gray-200 bg-white text-gray-900 outline-none focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10 transition-colors cursor-pointer"
                            >
                                <option value="">Select an option</option>
                                {REFERRAL_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                            {referralSource === "Other" && (
                                <input
                                    type="text"
                                    placeholder="Please specify..."
                                    value={referralOther}
                                    onChange={(e) => setReferralOther(e.target.value)}
                                    className="mt-2 w-full px-4 py-2.5 rounded-sm border text-sm border-gray-200 bg-white text-gray-900 outline-none focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10 transition-colors"
                                />
                            )}
                        </div>

                        {/* Desktop button row — right below the form */}
                        <div className="hidden lg:flex items-center justify-between pt-6 border-t border-gray-100">
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={() => {
                                    if (agreementSigned === "no") {
                                        setAgreementSigned(null);
                                    }
                                    setStep(3);
                                }}
                            >
                                <ChevronLeft size={16} strokeWidth={2.5} /> Back
                            </Button>
                            <Button variant="primary" size="md" onClick={handleComplete} loading={submitting}>
                                <CheckCircle2 size={16} strokeWidth={2.5} /> Submit
                            </Button>
                        </div>

                        {/* Mobile fixed bottom buttons */}
                        <div className="lg:hidden fixed bottom-0 left-0 w-full px-5 py-4 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] flex gap-3">
                            <Button
                                variant="secondary"
                                size="lg"
                                className="flex-1"
                                onClick={() => {
                                    if (agreementSigned === "no") {
                                        setAgreementSigned(null);
                                    }
                                    setStep(3);
                                }}
                            >
                                <ChevronLeft size={18} strokeWidth={2.5} /> Back
                            </Button>
                            <Button variant="primary" size="lg" className="flex-1" onClick={handleComplete} loading={submitting}>
                                <CheckCircle2 size={18} strokeWidth={2.5} /> Submit
                            </Button>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
