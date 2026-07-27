"use client";

import { Plus, ChevronLeft, CheckCircle2, Trash2, User, Users, Search, Loader2 } from "lucide-react";
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
    documentUploadMode: "me" | "co" | "both" | null;
    documentUploaderCoPersonId: string | null;
    referralSource: string;
    // Referral attribution — set only when a valid referral code was applied.
    // Null otherwise (e.g. the manual "no code" path below).
    partnerId: string | null;
    // Manual referral — captured on the "I don't have a code" path when the
    // source is an agent/broker, so staff can credit an off-system referrer.
    referralAgentName: string;
    referralAgentCompany: string;
    referralAgentEmail: string;
    referralAgentPhone: string;
}

// The manual agent/broker details entered when the client has no referral code.
export interface ReferralAgentInfo {
    name: string;
    company: string;
    email: string;
    phone: string;
    // Set when the client picked an EXISTING partner from the "Agent name"
    // search. Threaded through to the intake as partner_id so we link straight
    // to that partner instead of find-or-create'ing a duplicate. Null when the
    // client is describing a brand-new agent by hand.
    partnerId: string | null;
}

// A partner surfaced by the "Agent name" search on the no-code path.
export interface PartnerSearchResult {
    id: string;
    agent_name: string | null;
    agent_email: string | null;
    agent_phone: string | null;
    brokerage_type: "Mortgage Broker" | "Real Estate Agent" | null;
    brokerage_name: string | null;
}

// A partner resolved from an applied referral code (subset of the partners
// master).
export interface ReferralPartner {
    id: string;
    agent_name: string | null;
    agent_email: string | null;
    agent_phone: string | null;
    brokerage_type: "Mortgage Broker" | "Real Estate Agent" | null;
    brokerage_name: string | null;
}

// The outcome of applying a referral code, persisted on the intake page so it
// survives Back/Next navigation. A code maps to exactly one partner
// (partners_referral_code_unique_idx), so there is never a choice to resolve.
export interface AppliedReferral {
    code: string;
    partnerId: string;
    partner: ReferralPartner;
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

export interface CoPersonCard {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    errors: { fullName?: string; email?: string; phone?: string };
    touched: { fullName?: boolean; email?: boolean; phone?: boolean };
}

export interface ContactInfo {
    fullName: string;
    email: string;
    phone: string;
}

const makeEmptyCard = (): CoPersonCard => ({
    id: crypto.randomUUID(),
    fullName: "",
    email: "",
    phone: "",
    errors: {},
    touched: {},
});

// Initials for a partner's avatar chip in the search results.
const initialsOf = (name: string): string =>
    name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("") || "?";

// Searchable "Agent name" field for the no-code path. As the client types we
// query existing partners; picking one links the intake to that partner (via
// onSelect) so no duplicate is created. Typing after a pick clears the link and
// treats the entry as a new agent again.
function AgentNameSearch({
    value,
    partnerType,
    hasError,
    placeholder,
    onNameChange,
    onSelect,
    onAddNew,
}: {
    value: string;
    partnerType: "Real Estate Agent" | "Mortgage Broker";
    hasError: boolean;
    placeholder: string;
    onNameChange: (name: string) => void;
    onSelect: (partner: PartnerSearchResult) => void;
    onAddNew: (name: string) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const [results, setResults] = React.useState<PartnerSearchResult[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [query, setQuery] = React.useState(value);
    const containerRef = React.useRef<HTMLDivElement>(null);
    // Suppresses the fetch that would otherwise fire right after a selection
    // sets the input value programmatically.
    const skipNextFetch = React.useRef(false);

    // Debounced search whenever the typed query changes.
    React.useEffect(() => {
        if (skipNextFetch.current) {
            skipNextFetch.current = false;
            return;
        }
        if (!open) return;
        let cancelled = false;
        const t = setTimeout(async () => {
            if (cancelled) return;
            setLoading(true);
            try {
                const params = new URLSearchParams({ q: query.trim(), type: partnerType });
                const res = await fetch(`/api/referral/search?${params.toString()}`);
                const data = await res.json();
                if (!cancelled) setResults(data.partners ?? []);
            } catch {
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [query, partnerType, open]);

    // Close the dropdown on an outside click.
    React.useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [open]);

    const handleSelect = (partner: PartnerSearchResult) => {
        skipNextFetch.current = true;
        setQuery(partner.agent_name ?? "");
        setOpen(false);
        onSelect(partner);
    };

    // No existing match — confirm the typed name as a brand-new agent/broker.
    const handleAddNew = () => {
        const name = query.trim();
        if (!name) return;
        skipNextFetch.current = true;
        setOpen(false);
        onAddNew(name);
    };

    // Singular noun for the "add new" affordance ("agent" / "broker").
    const partnerNoun = partnerType === "Mortgage Broker" ? "broker" : "agent";

    return (
        <div className="relative" ref={containerRef}>
            <div
                className={`flex items-center rounded-lg border bg-white transition-colors ${hasError ? "border-[#C10007] ring-2 ring-[#C10007]/10" : "border-gray-200 focus-within:border-[#C10007] focus-within:ring-2 focus-within:ring-[#C10007]/10"}`}
            >
                <input
                    type="text"
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => {
                        const val = e.target.value;
                        setQuery(val);
                        setOpen(true);
                        // Typing a new name breaks any existing-partner link.
                        onNameChange(val);
                    }}
                    onFocus={() => setOpen(true)}
                    className="flex-1 px-4 py-2.5 text-sm bg-transparent text-gray-900 outline-none"
                />
                <Search size={16} className="mr-3 text-gray-400 flex-shrink-0" />
            </div>

            {open && (
                <div className="absolute z-30 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5 overflow-hidden">
                    <div className="max-h-72 overflow-y-auto py-1">
                        {loading && results.length === 0 ? (
                            <div className="flex items-center gap-2.5 px-4 py-3.5 text-sm text-gray-500">
                                <Loader2 size={15} className="animate-spin text-[#C10007]" />
                                Searching {partnerType === "Mortgage Broker" ? "brokers" : "agents"}…
                            </div>
                        ) : results.length === 0 ? (
                            <div>
                                {query.trim() && (
                                    <button
                                        type="button"
                                        onClick={handleAddNew}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                                    >
                                        <span className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0">
                                            <Plus size={16} />
                                        </span>
                                        <span className="text-sm font-bold text-[#C10007] truncate">
                                            Add &quot;{query.trim()}&quot; as a new {partnerNoun}
                                        </span>
                                    </button>
                                )}
                                <div className="px-4 py-2.5 text-xs text-gray-400">
                                    No matches — keep typing to add a new {partnerNoun}.
                                </div>
                            </div>
                        ) : (
                            results.map((partner) => {
                                // Never render a blank primary line — fall back to the
                                // brokerage, then a generic label, when there's no name.
                                const primary =
                                    partner.agent_name?.trim() ||
                                    partner.brokerage_name?.trim() ||
                                    "Unnamed partner";
                                const secondary =
                                    partner.agent_name?.trim() && partner.brokerage_name?.trim()
                                        ? partner.brokerage_name.trim()
                                        : null;
                                return (
                                    <button
                                        key={partner.id}
                                        type="button"
                                        onClick={() => handleSelect(partner)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                                    >
                                        <span className="w-9 h-9 rounded-full bg-[#FEF2F2] text-[#C10007] text-xs font-bold flex items-center justify-center flex-shrink-0 ring-1 ring-[#C10007]/10">
                                            {initialsOf(primary)}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold text-gray-900 truncate">
                                                {primary}
                                            </span>
                                            {secondary && (
                                                <span className="block text-xs text-gray-500 truncate">
                                                    {secondary}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
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
    /** Determines which co-person sections render: buying→Co-Purchaser, selling→Co-Seller, both→both sections */
    selectedClosingOption?: string | null;
    // Lifted state — owned by the intake page so values persist when the user
    // navigates Back to an earlier step and returns.
    contactInfo: ContactInfo;
    setContactInfo: React.Dispatch<React.SetStateAction<ContactInfo>>;
    coPurchaserCards: CoPersonCard[];
    setCoPurchaserCards: React.Dispatch<React.SetStateAction<CoPersonCard[]>>;
    coSellerCards: CoPersonCard[];
    setCoSellerCards: React.Dispatch<React.SetStateAction<CoPersonCard[]>>;
    referralSource: string;
    setReferralSource: React.Dispatch<React.SetStateAction<string>>;
    referralOther: string;
    setReferralOther: React.Dispatch<React.SetStateAction<string>>;
    referralCode: string;
    setReferralCode: React.Dispatch<React.SetStateAction<string>>;
    appliedReferral: AppliedReferral | null;
    setAppliedReferral: React.Dispatch<React.SetStateAction<AppliedReferral | null>>;
    // "I don't have a code" toggle → reveals the "How did you hear about us?" flow.
    referralNoCode: boolean;
    setReferralNoCode: React.Dispatch<React.SetStateAction<boolean>>;
    referralAgent: ReferralAgentInfo;
    setReferralAgent: React.Dispatch<React.SetStateAction<ReferralAgentInfo>>;
    documentUploadChoice: string;
    setDocumentUploadChoice: React.Dispatch<React.SetStateAction<string>>;
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
    contactInfo,
    setContactInfo,
    coPurchaserCards,
    setCoPurchaserCards,
    coSellerCards,
    setCoSellerCards,
    referralSource,
    setReferralSource,
    referralOther,
    setReferralOther,
    referralCode,
    setReferralCode,
    appliedReferral,
    setAppliedReferral,
    referralNoCode,
    setReferralNoCode,
    referralAgent,
    setReferralAgent,
    documentUploadChoice,
    setDocumentUploadChoice,
}: Step5ContactProps) {
    const isBoth = selectedClosingOption === "both";
    const isSelling = selectedClosingOption === "selling";
    const showPurchaserStack = isBoth || !isSelling;
    const showSellerStack = isBoth || isSelling;
    const { error: toastError } = useToast();

    // Alias lifted props back to the local names used throughout the JSX.
    const formData = contactInfo;
    const setFormData = setContactInfo;

    const [submitting, setSubmitting] = React.useState(false);

    // Referral code flow — shown only when the referral source is an agent/broker.
    const isReferralPartner =
        referralSource === "Real estate agent" || referralSource === "Mortgage broker";
    const [applyingCode, setApplyingCode] = React.useState(false);
    const [referralError, setReferralError] = React.useState<string | null>(null);

    const handleApplyReferral = async () => {
        const code = referralCode.trim();
        if (!code) {
            setReferralError("Enter a referral code.");
            return;
        }
        setApplyingCode(true);
        setReferralError(null);
        try {
            const res = await fetch(`/api/referral/validate?code=${encodeURIComponent(code)}`);
            const data = await res.json();
            if (!data.valid) {
                setReferralError(data.error || "That referral code isn't valid.");
                return;
            }
            const partner: ReferralPartner = data.partner;
            setAppliedReferral({
                code: data.code,
                partnerId: partner.id,
                partner,
            });
        } catch {
            setReferralError("Couldn't verify the code. Please try again.");
        } finally {
            setApplyingCode(false);
        }
    };

    const handleChangeReferral = () => {
        setAppliedReferral(null);
        setReferralError(null);
        setReferralNoCode(false);
    };

    // "Agent" vs "Broker" wording for the manual (no-code) fields.
    const partnerNoun = referralSource === "Mortgage broker" ? "Broker" : "Agent";
    // partners.brokerage_type value the "Agent name" search scopes to.
    const partnerType: "Real Estate Agent" | "Mortgage Broker" =
        referralSource === "Mortgage broker" ? "Mortgage Broker" : "Real Estate Agent";
    const updateAgent = (field: keyof ReferralAgentInfo, value: string) =>
        setReferralAgent((prev) => ({ ...prev, [field]: value }));

    // Client typed in the name box — keep the text but break any existing-partner
    // link so we don't credit the wrong record. When a partner WAS linked, the
    // email/phone/company were auto-filled from that record, so wipe them too;
    // otherwise a new agent inherits the previous agent's stale contact details.
    const handleAgentNameChange = (name: string) =>
        setReferralAgent((prev) =>
            prev.partnerId
                ? { name, company: "", email: "", phone: "", partnerId: null }
                : { ...prev, name, partnerId: null },
        );

    // Client confirmed the typed name as a brand-new agent via the "Add … as a
    // new agent" option — start a clean record (no stale details, no link).
    const handleAddNewAgent = (name: string) => {
        setReferralAgent({ name, company: "", email: "", phone: "", partnerId: null });
        setReferralAgentErrors({});
    };

    // Client picked an existing partner from the search — prefill every field
    // and record the id so the intake links straight to it (no duplicate).
    const handleSelectPartner = (partner: PartnerSearchResult) => {
        setReferralAgent({
            name: partner.agent_name ?? "",
            company: partner.brokerage_name ?? "",
            email: partner.agent_email ?? "",
            phone: partner.agent_phone ?? "",
            partnerId: partner.id,
        });
        setReferralAgentErrors({});
    };

    // Name and email identify the referrer (email is also the dedup key used to
    // find-or-create their Partner record), so both are required. Company and
    // phone are nice-to-have and stay optional.
    const validateReferralAgent = (
        agent: ReferralAgentInfo,
    ): { name?: string; email?: string; phone?: string } => {
        const errs: { name?: string; email?: string; phone?: string } = {};
        const phoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;
        // Linked to an existing partner: identity comes from that record (which
        // may legitimately have no email), so we only sanity-check the phone.
        if (agent.partnerId) {
            if (agent.phone.trim() && !phoneRegex.test(agent.phone.trim()))
                errs.phone = "Enter phone in (416) 555-1234 format.";
            return errs;
        }
        if (!agent.name.trim()) errs.name = `${partnerNoun} name is required.`;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!agent.email.trim()) errs.email = `${partnerNoun} email is required.`;
        else if (!emailRegex.test(agent.email.trim())) errs.email = "Enter a valid email address.";
        // Optional — but if they typed something, it must be a full number.
        if (agent.phone.trim() && !phoneRegex.test(agent.phone.trim()))
            errs.phone = "Enter phone in (416) 555-1234 format.";
        return errs;
    };

    const [referralAgentErrors, setReferralAgentErrors] = React.useState<{
        name?: string;
        email?: string;
        phone?: string;
    }>({});

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
    const [isValid, setIsValid] = React.useState(false);

    const isLoggedIn = !!initialData?.email;

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

    const activeCoCards = React.useMemo(
        () => [
            ...(showPurchaserStack ? coPurchaserCards.filter(c => !isCardEmpty(c)).map(c => ({ ...c, role: "purchaser" as const })) : []),
            ...(showSellerStack ? coSellerCards.filter(c => !isCardEmpty(c)).map(c => ({ ...c, role: "seller" as const })) : []),
        ],
        [coPurchaserCards, coSellerCards, showPurchaserStack, showSellerStack]
    );

    React.useEffect(() => {
        if (activeCoCards.length === 0 && documentUploadChoice) {
            setDocumentUploadChoice("");
            return;
        }
        if (
            documentUploadChoice.startsWith("co:") &&
            !activeCoCards.some((card) => `co:${card.id}` === documentUploadChoice)
        ) {
            setDocumentUploadChoice("");
        }
    }, [activeCoCards, documentUploadChoice, setDocumentUploadChoice]);


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

    const isCompleteEnabled = isValid;

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

        // Block submission when a co-person shares an email with the primary
        // contact or with another co-person — same email = same person.
        const normalizeEmail = (e: string) => e.trim().toLowerCase();
        const primaryEmail = normalizeEmail(formData.email);
        const purchaserDupIds = new Map<string, string>();
        const sellerDupIds = new Map<string, string>();
        const seenEmails = new Map<string, "primary" | "purchaser" | "seller">();
        seenEmails.set(primaryEmail, "primary");

        const activeStacks: Array<{ which: "purchaser" | "seller"; cards: CoPersonCard[] }> = [
            ...(showPurchaserStack ? [{ which: "purchaser" as const, cards: coPurchaserCards }] : []),
            ...(showSellerStack ? [{ which: "seller" as const, cards: coSellerCards }] : []),
        ];

        for (const { which, cards } of activeStacks) {
            for (const card of cards) {
                if (isCardEmpty(card)) continue;
                const email = normalizeEmail(card.email);
                const conflict = seenEmails.get(email);
                if (conflict) {
                    const msg =
                        conflict === "primary"
                            ? "Cannot match the primary contact's email."
                            : "This email is already used by another co-person.";
                    (which === "purchaser" ? purchaserDupIds : sellerDupIds).set(card.id, msg);
                } else {
                    seenEmails.set(email, which);
                }
            }
        }

        if (purchaserDupIds.size > 0 || sellerDupIds.size > 0) {
            const applyDupErrors = (dupIds: Map<string, string>) => (prev: CoPersonCard[]) =>
                prev.map(card => {
                    const msg = dupIds.get(card.id);
                    if (!msg) return card;
                    return {
                        ...card,
                        errors: { ...card.errors, email: msg },
                        touched: { ...card.touched, email: true },
                    };
                });
            if (purchaserDupIds.size > 0) setCoPurchaserCards(applyDupErrors(purchaserDupIds));
            if (sellerDupIds.size > 0) setCoSellerCards(applyDupErrors(sellerDupIds));
            toastError("A co-purchaser or co-seller cannot be the same person as the primary contact.");
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

        let documentUploadMode: ContactData["documentUploadMode"] = null;
        let documentUploaderCoPersonId: string | null = null;
        if (coPersons.length > 0) {
            if (!documentUploadChoice) {
                toastError("Please choose who will upload documents.");
                return;
            }
            if (documentUploadChoice === "me") {
                documentUploadMode = "me";
            } else if (documentUploadChoice === "both") {
                documentUploadMode = "both";
            } else if (documentUploadChoice.startsWith("co:")) {
                const coPersonId = documentUploadChoice.slice(3);
                if (!coPersons.some((cp) => cp.id === coPersonId)) {
                    toastError("Please choose a valid document uploader.");
                    return;
                }
                documentUploadMode = "co";
                documentUploaderCoPersonId = coPersonId;
            } else {
                toastError("Please choose who will upload documents.");
                return;
            }
        }

        // Referral source: a resolved code wins (record the partner's type, or a
        // generic label); otherwise the manual "how did you hear" value.
        const finalReferral = appliedReferral
            ? appliedReferral.partner.brokerage_type ?? "Referral code"
            : referralSource === "Other"
                ? referralOther.trim()
                : referralSource;
        // Manual agent details only apply on the no-code + agent/broker path.
        const useManualAgent = !appliedReferral && isReferralPartner;
        if (useManualAgent) {
            const agentErrs = validateReferralAgent(referralAgent);
            setReferralAgentErrors(agentErrs);
            if (Object.keys(agentErrs).length > 0) {
                toastError(`Please complete the ${partnerNoun.toLowerCase()} details.`);
                return;
            }
        }
        setSubmitting(true);
        try {
            await onComplete({
                ...formData,
                meetingDate: null,
                meetingTime: null,
                coPersons,
                documentUploadMode,
                documentUploaderCoPersonId,
                referralSource: finalReferral,
                // A resolved referral code wins; otherwise the partner the client
                // picked from the "Agent name" search (links, no duplicate). Falls
                // back to null so a hand-typed new agent still find-or-creates.
                partnerId: appliedReferral
                    ? appliedReferral.partnerId
                    : useManualAgent
                        ? referralAgent.partnerId
                        : null,
                referralAgentName: useManualAgent ? referralAgent.name.trim() : "",
                referralAgentCompany: useManualAgent ? referralAgent.company.trim() : "",
                referralAgentEmail: useManualAgent ? referralAgent.email.trim() : "",
                referralAgentPhone: useManualAgent ? referralAgent.phone.trim() : "",
            });
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

                        {activeCoCards.length > 0 && (
                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-sm font-medium text-gray-900">
                                    Who will upload documents for this file? <span className="text-[#C10007]">*</span>
                                </label>
                                <select
                                    value={documentUploadChoice}
                                    onChange={(e) => setDocumentUploadChoice(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-sm border text-sm border-gray-200 bg-white text-gray-900 outline-none focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10 transition-colors cursor-pointer"
                                >
                                    <option value="">Select an option</option>
                                    <option value="me">{formData.fullName || "You"}</option>
                                    {activeCoCards.map((card) => (
                                        <option key={card.id} value={`co:${card.id}`}>
                                            {card.fullName || (card.role === "purchaser" ? "Co-purchaser" : "Co-seller")}
                                        </option>
                                    ))}
                                    <option value="both">We&apos;ll each upload our own</option>
                                </select>
                            </div>
                        )}

                        {/* Referral / "How did you hear about us?" — code-first flow.
                            Enter a code (resolves the referring broker), or click
                            "I don't have a code" to pick a source and optionally
                            credit an agent/broker manually. */}
                        {appliedReferral ? (
                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-sm font-medium text-gray-900">
                                    Referral code{" "}
                                    <span className="text-gray-400 font-normal">(optional)</span>
                                </label>
                                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            <CheckCircle2 size={20} className="text-green-600 mt-0.5 flex-shrink-0" />
                                            <div className="text-sm">
                                                <p className="font-semibold text-gray-900">
                                                    {appliedReferral.partner.agent_name ?? `Code "${appliedReferral.code}" applied`}
                                                </p>
                                                <p className="text-gray-500">
                                                    {[
                                                        appliedReferral.partner.brokerage_type,
                                                        appliedReferral.partner.brokerage_name,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" · ")}
                                                </p>
                                                {appliedReferral.partner.agent_email && (
                                                    <p className="text-gray-500">{appliedReferral.partner.agent_email}</p>
                                                )}
                                                <p className="mt-2 text-gray-500">
                                                    We&apos;ll keep them updated on your file&apos;s progress.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleChangeReferral}
                                            className="text-sm font-semibold text-[#C10007] underline cursor-pointer flex-shrink-0"
                                        >
                                            Change
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-sm font-medium text-gray-900">
                                    Referral code{" "}
                                    <span className="text-gray-400 font-normal">(optional)</span>
                                </label>
                                <div className="flex items-stretch gap-2">
                                    <input
                                        type="text"
                                        placeholder="E.G. JANE2024"
                                        value={referralCode}
                                        onChange={(e) => {
                                            setReferralCode(e.target.value);
                                            if (referralError) setReferralError(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleApplyReferral();
                                            }
                                        }}
                                        className={`flex-1 px-4 py-2.5 rounded-sm border text-sm bg-white text-gray-900 outline-none transition-colors ${referralError ? "border-[#C10007] ring-2 ring-[#C10007]/10" : "border-gray-200 focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10"}`}
                                    />
                                    <Button
                                        variant="secondary"
                                        size="md"
                                        onClick={handleApplyReferral}
                                        loading={applyingCode}
                                        disabled={!referralCode.trim()}
                                    >
                                        Apply
                                    </Button>
                                </div>
                                {referralError && <p className="text-xs text-[#C10007]">{referralError}</p>}
                                <p className="text-xs text-gray-500">
                                    If your agent or broker gave you a code, it links your file to them automatically.
                                </p>
                                {/* Reveals the "How did you hear about us?" section below —
                                    the Referral code field above stays visible. */}
                                {!referralNoCode && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReferralNoCode(true);
                                            setReferralError(null);
                                        }}
                                        className="self-start text-sm font-semibold text-[#C10007] cursor-pointer"
                                    >
                                        I don&apos;t have a code
                                    </button>
                                )}
                            </div>
                        )}

                        {/* How did you hear about us? — revealed once the client says
                            they have no code. The Referral code field above stays visible. */}
                        {referralNoCode && !appliedReferral && (
                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-sm font-medium text-gray-900">
                                    How did you hear about us?{" "}
                                    <span className="text-gray-400 font-normal">(optional)</span>
                                </label>
                                <select
                                    value={referralSource}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setReferralSource(next);
                                        if (next !== "Other") setReferralOther("");
                                        const nextIsPartner =
                                            next === "Real estate agent" || next === "Mortgage broker";
                                        // Clear the manual agent fields when the source isn't an
                                        // agent/broker so stale details aren't submitted.
                                        if (!nextIsPartner) {
                                            setReferralAgent({ name: "", company: "", email: "", phone: "", partnerId: null });
                                            setReferralAgentErrors({});
                                        }
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

                                {/* Manual agent/broker details — so staff can credit an
                                    off-system referrer the client heard about us through. */}
                                {isReferralPartner && (
                                    <div className="mt-3 border-l-2 border-[#C10007] pl-4 space-y-4">
                                        <p className="text-sm text-gray-500">
                                            Start typing their name — pick them from our list, or add a new
                                            one. We&apos;ll keep them posted on your file.
                                        </p>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-sm font-semibold text-gray-800">
                                                {partnerNoun} name
                                                <span className="text-red-600 ml-1">*</span>
                                            </label>
                                            <AgentNameSearch
                                                value={referralAgent.name}
                                                partnerType={partnerType}
                                                hasError={!!referralAgentErrors.name}
                                                placeholder={`Search ${partnerNoun.toLowerCase()}s, e.g. Jane Smith`}
                                                onNameChange={handleAgentNameChange}
                                                onSelect={handleSelectPartner}
                                                onAddNew={handleAddNewAgent}
                                            />
                                            {referralAgent.partnerId && (
                                                <p className="mt-1 flex items-center gap-1.5 text-xs text-green-600">
                                                    <CheckCircle2 size={13} strokeWidth={2} />
                                                    Linked to an existing {partnerNoun.toLowerCase()} on file.
                                                </p>
                                            )}
                                            {referralAgentErrors.name && (
                                                <p className="text-red-600 text-sm mt-1">{referralAgentErrors.name}</p>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-sm font-semibold text-gray-800">
                                                Company / brokerage{" "}
                                                <span className="text-gray-400 font-normal">(optional)</span>
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="RE/MAX Realtron"
                                                value={referralAgent.company}
                                                onChange={(e) => updateAgent("company", e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-lg border text-sm border-gray-200 bg-white text-gray-900 outline-none focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10 transition-colors"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-sm font-semibold text-gray-800">
                                                {partnerNoun} email
                                                <span className="text-red-600 ml-1">*</span>
                                            </label>
                                            <input
                                                type="email"
                                                placeholder="jane@remax.ca"
                                                value={referralAgent.email}
                                                onChange={(e) => updateAgent("email", e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-lg border text-sm border-gray-200 bg-white text-gray-900 outline-none focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10 transition-colors"
                                            />
                                            {referralAgentErrors.email && (
                                                <p className="text-red-600 text-sm mt-1">{referralAgentErrors.email}</p>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-sm font-semibold text-gray-800">
                                                {partnerNoun} phone{" "}
                                                <span className="text-gray-400 font-normal">(optional)</span>
                                            </label>
                                            <input
                                                type="tel"
                                                placeholder="(416) 555-1234"
                                                value={referralAgent.phone}
                                                onChange={(e) => updateAgent("phone", formatCoPhone(e.target.value))}
                                                className="w-full px-4 py-2.5 rounded-lg border text-sm border-gray-200 bg-white text-gray-900 outline-none focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10 transition-colors"
                                            />
                                            {referralAgentErrors.phone && (
                                                <p className="text-red-600 text-sm mt-1">{referralAgentErrors.phone}</p>
                                            )}
                                        </div>
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
