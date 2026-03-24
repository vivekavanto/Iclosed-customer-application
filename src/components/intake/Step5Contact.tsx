"use client";

import { Plus, ChevronLeft, CheckCircle2, CalendarCheck, Clock, Video, X, Trash2, Users } from "lucide-react";
import React from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import CalScheduler from "@/components/shared/CalScheduler";

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ?? "https://calendly.com/navawilson/iclosed-lead-meeting";

interface ContactData {
    fullName: string;
    email: string;
    phone: string;
    meetingDate: Date | null;
    meetingTime: string | null;
    coPersons: CoPerson[];
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
    onComplete: (data: ContactData) => void;
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
    const coLabel = selectedClosingOption === "selling" ? "Co-Seller" : "Co-Purchaser";

    // ── Co-person state ──
    const [coPersons, setCoPersons] = React.useState<CoPerson[]>([]);
    const [showCoModal, setShowCoModal] = React.useState(false);
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
        setShowCoModal(false);
    };

    const handleRemoveCoPerson = (id: string) => {
        setCoPersons(prev => prev.filter(p => p.id !== id));
    };

    const leftSteps = [
        { id: 1, label: "Select Service" },
        { id: 2, label: "Price" },
        { id: 3, label: "Address" },
        { id: 4, label: "Agreement Signed" },
        ...(agreementSigned === "yes" ? [{ id: 5, label: "Upload Document" }] : []),
        { id: agreementSigned === "yes" ? 6 : 5, label: "Contact Info" },
    ];

    const formatPhone = (value: string): string => {
        const digits = value.replace(/\D/g, "").slice(0, 10);
        if (digits.length <= 3) return digits.length ? `(${digits}` : "";
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    };

    const [isValid, setIsValid] = React.useState(false);
    const [calendlyBooked, setCalendlyBooked] = React.useState(false);
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

    // Calendly booking success is passed as a callback to CalScheduler

    const isCompleteEnabled =
        isValid && (agreementSigned === "yes" || (agreementSigned === "no" && calendlyBooked));

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
    const handleComplete = () => {
        if (!isCompleteEnabled) return;
        onComplete({ ...formData, meetingDate: null, meetingTime: null, coPersons });
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
                                Fill in your contact details
                                {agreementSigned === "no" ? " and schedule a meeting." : "."}
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

                        {/* Meeting booked badge */}
                        {calendlyBooked && (
                            <div className="mt-5 flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                                <CalendarCheck size={15} className="text-green-600 flex-shrink-0" strokeWidth={2.5} />
                                <p className="text-xs font-semibold text-green-700">Meeting scheduled!</p>
                            </div>
                        )}
                    </div>

                </div>

                {/* RIGHT PANEL */}
                <div className="flex-1 p-6 sm:p-10 lg:p-12 pb-28 lg:pb-12">
                    <div className="space-y-8 w-full">

                        {/* Contact Form */}
                        <Input
                            label="Full Name"
                            required
                            placeholder="John Doe"
                            value={formData.fullName}
                            onChange={(e) =>
                                setFormData({ ...formData, fullName: e.target.value })
                            }
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
                        <div>
                            <Button
                                variant="ghost"
                                className="w-full border border-dashed border-red-200 text-gray-900 hover:text-[#C10007] hover:bg-transparent"
                                onClick={() => setShowCoModal(true)}
                            >
                                <Plus size={18} />
                                Add {coLabel}
                            </Button>
                        </div>

                        {/* Co-person modal */}
                        {showCoModal && (
                            <>
                                <div
                                    className="fixed inset-0 z-40 bg-black/40"
                                    onClick={() => setShowCoModal(false)}
                                />
                                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto">
                                        {/* Modal header */}
                                        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-[#FEF2F2] flex items-center justify-center">
                                                    <Users size={18} className="text-[#C10007]" strokeWidth={2} />
                                                </div>
                                                <h3 className="text-base font-bold text-gray-900">Add a {coLabel}</h3>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { setShowCoModal(false); setCoErrors({}); setCoTouched({}); setCoForm({ fullName: "", email: "", phone: "" }); }}
                                                className="cursor-pointer w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                            >
                                                <X size={18} />
                                            </button>
                                        </div>

                                        {/* Modal body */}
                                        <div className="px-6 py-5 space-y-4">
                                            {/* Full Name */}
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                                                    Full Name <span className="text-[#C10007]">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="John Doe"
                                                    value={coForm.fullName}
                                                    onChange={(e) => { setCoForm(f => ({ ...f, fullName: e.target.value })); if (coTouched.fullName) setCoErrors(validateCoForm()); }}
                                                    onBlur={() => { setCoTouched(t => ({ ...t, fullName: true })); setCoErrors(validateCoForm()); }}
                                                    className={`w-full px-4 py-3 text-sm rounded-lg border outline-none transition-colors ${coTouched.fullName && coErrors.fullName ? "border-[#C10007] ring-2 ring-[#C10007]/10" : "border-gray-200 focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10"}`}
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
                                                    className={`w-full px-4 py-3 text-sm rounded-lg border outline-none transition-colors ${coTouched.email && coErrors.email ? "border-[#C10007] ring-2 ring-[#C10007]/10" : "border-gray-200 focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10"}`}
                                                />
                                                {coTouched.email && coErrors.email && <p className="mt-1 text-xs text-[#C10007]">{coErrors.email}</p>}
                                            </div>

                                            {/* Phone */}
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                                                    Phone Number <span className="text-[#C10007]">*</span>
                                                </label>
                                                <div className="flex items-center border rounded-lg overflow-hidden transition-colors focus-within:border-[#C10007] focus-within:ring-2 focus-within:ring-[#C10007]/10 border-gray-200">
                                                    <span className="flex items-center gap-1.5 px-3 py-3 text-sm text-gray-500 border-r border-gray-200 bg-gray-50 flex-shrink-0">
                                                        🇨🇦 +1
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
                                        </div>

                                        {/* Modal footer */}
                                        <div className="px-6 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-3">
                                            <button
                                                type="button"
                                                onClick={() => { setShowCoModal(false); setCoErrors({}); setCoTouched({}); setCoForm({ fullName: "", email: "", phone: "" }); }}
                                                className="cursor-pointer flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleAddCoPerson}
                                                className="cursor-pointer flex-1 px-4 py-2.5 text-sm font-bold text-white bg-[#C10007] rounded-lg hover:bg-[#a30006] transition-colors"
                                            >
                                                Add {coLabel}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ── Calendly Inline Scheduler ── */}
                        {agreementSigned === "no" && (
                            <div>
                                {/* Section header */}
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
                                        <CalendarCheck size={15} className="text-[#C10007]" strokeWidth={2} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">Schedule Your Initial Meeting</p>
                                        <p className="text-xs text-gray-400">Pick a date and time that works for you</p>
                                    </div>
                                </div>

                                {/* Quick info strip */}
                                <div className="flex flex-wrap gap-4 mb-4 px-1">
                                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                                        <Clock size={13} strokeWidth={2} /> 15 min
                                    </span>
                                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                                        <Video size={13} strokeWidth={2} />
                                        Web conferencing details provided upon confirmation
                                    </span>
                                </div>

                                {/* After booking: success state */}
                                {calendlyBooked ? (
                                    <div className="rounded-2xl border border-green-200 bg-green-50 px-6 py-10 flex flex-col items-center gap-3 text-center">
                                        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                                            <CheckCircle2 size={28} className="text-green-600" strokeWidth={2} />
                                        </div>
                                        <p className="text-base font-bold text-green-700">Meeting successfully scheduled!</p>
                                        <p className="text-sm text-gray-500 max-w-xs">
                                            A confirmation has been sent to your email. Click <strong>Submit</strong> to complete your intake.
                                        </p>
                                    </div>
                                ) : (
                                    /* Calendly InlineWidget */
                                    <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                                        <CalScheduler
                                            url={CALENDLY_URL}
                                            height={700}
                                            prefill={{
                                                name: formData.fullName || undefined,
                                                email: formData.email || undefined,
                                            }}
                                            onBookingSuccess={() => setCalendlyBooked(true)}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Desktop button row — right below the form */}
                        <div className="hidden lg:flex items-center justify-between pt-6 border-t border-gray-100">
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={() => {
                                    if (agreementSigned === "yes") {
                                        setStep(5); // back to upload step
                                    } else {
                                        setAgreementSigned(null);
                                        setStep(4);
                                    }
                                }}
                            >
                                <ChevronLeft size={16} strokeWidth={2.5} /> Back
                            </Button>
                            <Button variant="primary" size="md" disabled={!isCompleteEnabled} onClick={handleComplete}>
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
                                    if (agreementSigned === "yes") {
                                        setStep(5); // back to upload step
                                    } else {
                                        setAgreementSigned(null);
                                        setStep(4);
                                    }
                                }}
                            >
                                <ChevronLeft size={18} strokeWidth={2.5} /> Back
                            </Button>
                            <Button variant="primary" size="lg" className="flex-1" disabled={!isCompleteEnabled} onClick={handleComplete}>
                                <CheckCircle2 size={18} strokeWidth={2.5} /> Submit
                            </Button>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}