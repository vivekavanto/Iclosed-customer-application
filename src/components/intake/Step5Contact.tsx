"use client";

<<<<<<< HEAD
import { Plus, ChevronLeft, CheckCircle2, X, Trash2, Users } from "lucide-react";
=======
import { Plus, ChevronLeft, ChevronDown, CheckCircle2, CalendarCheck, Clock, Video, Trash2, Users } from "lucide-react";
>>>>>>> main
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
}

interface Step5ContactProps {
    setStep: (step: number) => void;
    agreementSigned: "yes" | "no" | null;
    setAgreementSigned: (value: "yes" | "no" | null) => void;
    setShowSuccessModal: (show: boolean) => void;
    step: number;
    onComplete: (data: ContactData) => Promise<void> | void;
    /** Pre-fill contact fields when user is already logged in */
    initialData?: { fullName: string; email: string; phone: string };
    /** Determines co-person label: purchase→Co-Purchaser, sale→Co-Seller, both→Co-Purchaser */
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
    const coLabel = selectedClosingOption === "selling" ? "Co-Seller" : selectedClosingOption === "both" ? "Co-Purchaser / Co-Seller" : "Co-Purchaser";
    const coLabelShort = selectedClosingOption === "selling" ? "Co-Seller" : "Co-Purchaser";
    const { error: toastError } = useToast();

    // ── Co-person state ──
    const [submitting, setSubmitting] = React.useState(false);
    const [coPersons, setCoPersons] = React.useState<CoPerson[]>([]);
    const [showCoForm, setShowCoForm] = React.useState(false);
    const [coForm, setCoForm] = React.useState({ fullName: "", email: "", phone: "" });
    const [coErrors, setCoErrors] = React.useState<{ fullName?: string; email?: string; phone?: string }>({});
    const [coTouched, setCoTouched] = React.useState<{ fullName?: boolean; email?: boolean; phone?: boolean }>({});

    const formatCoPhone = (value: string): string => {
        const digits = value.replace(/\D/g, "").slice(0, 10);
        if (digits.length <= 3) return digits.length ? `(${digits}` : "";
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    };

    const validateCoForm = () => {
        const errs: typeof coErrors = {};
        if (!coForm.fullName.trim()) errs.fullName = "Full name is required.";
        else if (!/^[A-Za-z\s]+$/.test(coForm.fullName.trim())) errs.fullName = "Name can only contain letters.";
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!coForm.email.trim()) errs.email = "Email is required.";
        else if (!emailRegex.test(coForm.email.trim())) errs.email = "Enter a valid email address.";
        const phoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;
        if (!coForm.phone.trim()) errs.phone = "Phone number is required.";
        else if (!phoneRegex.test(coForm.phone.trim())) errs.phone = "Enter phone in (416) 555-1234 format.";
        return errs;
    };

    const handleAddCoPerson = () => {
        setCoTouched({ fullName: true, email: true, phone: true });
        const errs = validateCoForm();
        setCoErrors(errs);
        if (Object.keys(errs).length > 0) return;
        setCoPersons(prev => [...prev, { id: crypto.randomUUID(), ...coForm }]);
        setCoForm({ fullName: "", email: "", phone: "" });
        setCoErrors({});
        setCoTouched({});
        setShowCoForm(false);
    };

    const handleRemoveCoPerson = (id: string) => {
        setCoPersons(prev => prev.filter(p => p.id !== id));
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

    // Sync pre-fill when auth data loads asynchronously
    React.useEffect(() => {
        if (initialData) {
            setFormData({
                fullName: initialData.fullName,
                email: initialData.email,
                phone: initialData.phone,
            });
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
        const finalReferral = referralSource === "Other" ? referralOther.trim() : referralSource;
        setSubmitting(true);
        try {
            await onComplete({ ...formData, meetingDate: null, meetingTime: null, coPersons, referralSource: finalReferral });
        } finally {
            setSubmitting(false);
        }
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

                        {/* Contact Form */}
                        <Input
                            label="Full Name"
                            required
                            placeholder="John Doe"
                            value={formData.fullName}
                            onChange={(e) => {
                                const val = e.target.value;
                                const capitalized = val.replace(/\b\w/g, (c) => c.toUpperCase());
                                setFormData({ ...formData, fullName: capitalized });
                            }}
                            onBlur={() =>
                                setTouched((prev) => ({ ...prev, fullName: true }))
                            }
                        />
                        {touched.fullName && errors.fullName && (
                            <p className="text-red-600 text-sm mt-1">{errors.fullName}</p>
                        )}

                        <Input
                            label="Email Address"
                            required
                            placeholder="john@doe.com"
                            value={formData.email}
                            onChange={(e) =>
                                setFormData({ ...formData, email: e.target.value })
                            }
                            onBlur={() =>
                                setTouched((prev) => ({ ...prev, email: true }))
                            }
                        />
                        {touched.email && errors.email && (
                            <p className="text-red-600 text-sm mt-1">{errors.email}</p>
                        )}

                        <Input
                            label="Phone Number"
                            required
                            placeholder="(416) 555-1234"
                            value={formData.phone}
                            onChange={(e) =>
                                setFormData({ ...formData, phone: formatPhone(e.target.value) })
                            }
                            onBlur={() =>
                                setTouched((prev) => ({ ...prev, phone: true }))
                            }
                        />
                        {touched.phone && errors.phone && (
                            <p className="text-red-600 text-sm mt-1">{errors.phone}</p>
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

                        {/* Co-person cards */}
                        {coPersons.length > 0 && (
                            <div className="space-y-3">
                                {coPersons.map((p) => (
                                    <div key={p.id} className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                                        <div className="w-9 h-9 rounded-full bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
                                            <Users size={15} className="text-[#C10007]" strokeWidth={2} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{p.fullName}</p>
                                            <p className="text-xs text-gray-400 truncate">{p.email}</p>
                                            <p className="text-xs text-gray-400">{p.phone}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveCoPerson(p.id)}
                                            className="cursor-pointer flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-[#C10007] hover:border-red-200 transition-colors"
                                            aria-label="Remove"
                                        >
                                            <Trash2 size={13} strokeWidth={2} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add Co-Person button */}
                        <Button
                            variant="ghost"
                            className="w-full border border-dashed border-red-200 text-gray-900 hover:text-[#C10007] hover:bg-transparent"
                            onClick={() => {
                                setShowCoForm((prev) => !prev);
                                if (showCoForm) { setCoErrors({}); setCoTouched({}); setCoForm({ fullName: "", email: "", phone: "" }); }
                            }}
                        >
                            {showCoForm ? <ChevronDown size={18} className="rotate-180 transition-transform" /> : <Plus size={18} />}
                            {showCoForm ? "Close" : `Add ${coLabelShort}`}
                        </Button>

                        {/* Inline Co-Person form (expandable) */}
                        {showCoForm && (
                            <div className="rounded-xl border border-gray-200 p-5 sm:p-6 space-y-4 bg-gray-50">
                                {/* Full Name */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                                        Full Name <span className="text-[#C10007]">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="John Doe"
                                        value={coForm.fullName}
                                        onChange={(e) => { const val = e.target.value.replace(/\b\w/g, (c) => c.toUpperCase()); setCoForm(f => ({ ...f, fullName: val })); if (coTouched.fullName) setCoErrors(validateCoForm()); }}
                                        onBlur={() => { setCoTouched(t => ({ ...t, fullName: true })); setCoErrors(validateCoForm()); }}
                                        className={`w-full px-4 py-3 text-sm rounded-lg border outline-none transition-colors bg-white ${coTouched.fullName && coErrors.fullName ? "border-[#C10007] ring-2 ring-[#C10007]/10" : "border-gray-200 focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10"}`}
                                    />
                                    {coTouched.fullName && coErrors.fullName && <p className="mt-1 text-xs text-[#C10007]">{coErrors.fullName}</p>}
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                                        Email Address <span className="text-[#C10007]">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        placeholder="john@doe.com"
                                        value={coForm.email}
                                        onChange={(e) => { setCoForm(f => ({ ...f, email: e.target.value })); if (coTouched.email) setCoErrors(validateCoForm()); }}
                                        onBlur={() => { setCoTouched(t => ({ ...t, email: true })); setCoErrors(validateCoForm()); }}
                                        className={`w-full px-4 py-3 text-sm rounded-lg border outline-none transition-colors bg-white ${coTouched.email && coErrors.email ? "border-[#C10007] ring-2 ring-[#C10007]/10" : "border-gray-200 focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10"}`}
                                    />
                                    {coTouched.email && coErrors.email && <p className="mt-1 text-xs text-[#C10007]">{coErrors.email}</p>}
                                </div>

                                {/* Phone */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                                        Phone Number <span className="text-[#C10007]">*</span>
                                    </label>
                                    <div className="flex items-center border rounded-lg overflow-hidden transition-colors focus-within:border-[#C10007] focus-within:ring-2 focus-within:ring-[#C10007]/10 border-gray-200 bg-white">
                                        <span className="flex items-center gap-1.5 px-3 py-3 text-sm text-gray-500 border-r border-gray-200 bg-gray-50 flex-shrink-0">
                                            +1
                                        </span>
                                        <input
                                            type="tel"
                                            placeholder="(555)-123-4567"
                                            value={coForm.phone}
                                            onChange={(e) => { setCoForm(f => ({ ...f, phone: formatCoPhone(e.target.value) })); if (coTouched.phone) setCoErrors(validateCoForm()); }}
                                            onBlur={() => { setCoTouched(t => ({ ...t, phone: true })); setCoErrors(validateCoForm()); }}
                                            className="flex-1 px-3 py-3 text-sm outline-none bg-white"
                                        />
                                    </div>
                                    {coTouched.phone && coErrors.phone && <p className="mt-1 text-xs text-[#C10007]">{coErrors.phone}</p>}
                                </div>

                                {/* Add button */}
                                <div className="pt-1">
                                    <Button
                                        variant="primary"
                                        size="md"
                                        className="w-full"
                                        onClick={handleAddCoPerson}
                                    >
                                        <Plus size={16} strokeWidth={2.5} />
                                        Add {coLabelShort}
                                    </Button>
                                </div>
                            </div>
                        )}

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