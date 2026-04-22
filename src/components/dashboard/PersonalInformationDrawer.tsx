"use client";

import { useEffect, useState } from "react";
import { X, Info } from "lucide-react";
import Button from "@/components/ui/Button";

interface PersonalInformationDrawerProps {
  open: boolean;
  onClose: () => void;
  property?: {
    phone?: string | null;
    address_street?: string | null;
    address_city?: string | null;
    address_postal_code?: string | null;
  } | null;
  taskId?: string;
  onSaved?: () => void;
}

interface FormData {
  phone: string;
  streetAddress: string;
  city: string;
  postalCode: string;
  maritalStatus: string;
  propertyUse: string;
  previouslyOwned: string;
  citizenshipStatus: string;
  livedOutsideCanada: string;
  occupation: string;
  employerPhone: string;
  sourceOfFunds: string;
  signingMethod: string;
}

interface FormErrors {
  phone?: string;
  streetAddress?: string;
  city?: string;
  postalCode?: string;
  maritalStatus?: string;
  propertyUse?: string;
  previouslyOwned?: string;
  citizenshipStatus?: string;
  livedOutsideCanada?: string;
  occupation?: string;
  employerPhone?: string;
  sourceOfFunds?: string;
  signingMethod?: string;
}

const EMPTY: FormData = {
  phone: "",
  streetAddress: "",
  city: "",
  postalCode: "",
  maritalStatus: "",
  propertyUse: "",
  previouslyOwned: "",
  citizenshipStatus: "",
  livedOutsideCanada: "",
  occupation: "",
  employerPhone: "",
  sourceOfFunds: "",
  signingMethod: "",
};

type SlotKey = keyof FormData;

interface DbField {
  id: string;
  field_type: string;
  label: string;
  placeholder: string | null;
  required: boolean;
  order_index: number;
  options: { label: string; value: string }[] | null | unknown;
}

interface DbResponse {
  field_id: string | null;
  field_label: string;
  value: string | null;
  file_url: string | null;
  file_name: string | null;
}

// Keyword-based matchers so tiny label variations ("Phone Number" vs "Phone number")
// between the DB and the UI don't break the mapping.
const SLOT_MATCHERS: Record<SlotKey, (label: string) => boolean> = {
  phone: (l) => l.includes("phone") && !l.includes("employer") && !l.includes("business"),
  streetAddress: (l) => l.includes("street"),
  city: (l) => l === "city" || l.startsWith("city"),
  postalCode: (l) => l.includes("postal"),
  maritalStatus: (l) => l.includes("marital"),
  propertyUse: (l) => l.includes("primary residence") && l.includes("investment"),
  previouslyOwned: (l) => l.includes("ever owned"),
  citizenshipStatus: (l) => l.includes("citizenship"),
  livedOutsideCanada: (l) => l.includes("365 days") || (l.includes("lived") && l.includes("canada")),
  occupation: (l) => l.includes("occupation"),
  employerPhone: (l) => l.includes("employer") || (l.includes("business") && l.includes("phone")),
  sourceOfFunds: (l) => l.includes("source of funds"),
  signingMethod: (l) => l.includes("sign") && (l.includes("person") || l.includes("virtually")),
};

// Fallback content used when DB has no field for a given slot.
// Option values are aligned with the current DB seed so saved responses are consistent
// regardless of whether the fetch succeeded or fell back.
interface SlotFallback {
  label: string;
  fieldType: string;
  placeholder?: string;
  required: boolean;
  options?: { label: string; value: string }[];
}

const SLOT_FALLBACKS: Record<SlotKey, SlotFallback> = {
  phone: { label: "Phone number", fieldType: "phone", placeholder: "(416) 555-1234", required: true },
  streetAddress: { label: "Street address", fieldType: "text", placeholder: "e.g. 10 Milner Business Court", required: true },
  city: { label: "City", fieldType: "text", placeholder: "e.g. Toronto", required: true },
  postalCode: { label: "Postal code", fieldType: "text", placeholder: "e.g. M1B 3C6", required: true },
  maritalStatus: {
    label: "Marital Status",
    fieldType: "select",
    placeholder: "Select marital status",
    required: true,
    options: [
      { label: "Single", value: "single" },
      { label: "Married", value: "married" },
      { label: "Common-law", value: "common_law" },
      { label: "Divorced", value: "divorced" },
      { label: "Separated with formal separation agreement", value: "separated_formal" },
      { label: "Separated with no formal separation agreement", value: "separated_no_formal" },
    ],
  },
  propertyUse: {
    label: "Is this purchase property your primary residence or an investment property?",
    fieldType: "select",
    placeholder: "Select property use",
    required: true,
    options: [
      { label: "Primary", value: "primary" },
      { label: "Investment property", value: "investment" },
    ],
  },
  previouslyOwned: {
    label: "Have you or your spouse ever owned a property?",
    fieldType: "select",
    placeholder: "Select an option",
    required: true,
    options: [
      { label: "No (first time)", value: "no" },
      { label: "Yes", value: "yes" },
      { label: "Other", value: "other" },
    ],
  },
  citizenshipStatus: {
    label: "What is your citizenship status?",
    fieldType: "select",
    placeholder: "Select citizenship status",
    required: true,
    options: [
      { label: "Canadian citizen", value: "canadian_citizen" },
      { label: "Permanent resident", value: "permanent_resident" },
      { label: "Visa", value: "visa" },
      { label: "Granted refugee status in Canada", value: "refugee_status" },
      { label: "Non-Citizen or Unsure", value: "non_citizen_unsure" },
    ],
  },
  livedOutsideCanada: {
    label: "In the past 365 days, have you lived outside of Canada for 183 or more days?",
    fieldType: "select",
    placeholder: "Select an option",
    required: true,
    options: [
      { label: "No", value: "no" },
      { label: "Yes", value: "yes" },
    ],
  },
  occupation: { label: "What is your occupation?", fieldType: "text", placeholder: "e.g. Engineer", required: true },
  employerPhone: { label: "Business/Employer Phone Number", fieldType: "phone", placeholder: "(416) 555-1234", required: false },
  sourceOfFunds: {
    label: "What are your source of funds for the purchase?",
    fieldType: "textarea",
    placeholder: "e.g. Employment income, savings, gift from family...",
    required: true,
  },
  signingMethod: {
    label: "Would you like to sign the documents virtually or in person?",
    fieldType: "select",
    placeholder: "Select signing method",
    required: true,
    options: [
      { label: "In person", value: "in_person" },
      { label: "Virtually", value: "virtually" },
    ],
  },
};

interface ResolvedSlot {
  id: string | null;
  label: string;
  fieldType: string;
  placeholder?: string;
  required: boolean;
  options: { label: string; value: string }[];
}

function resolveSlot(key: SlotKey, dbFields: DbField[]): ResolvedSlot {
  const fb = SLOT_FALLBACKS[key];
  const match = dbFields.find((f) =>
    SLOT_MATCHERS[key](String(f.label ?? "").trim().toLowerCase()),
  );
  const dbOptions = Array.isArray(match?.options) ? (match!.options as { label: string; value: string }[]) : null;
  return {
    id: match?.id ?? null,
    label: match?.label ?? fb.label,
    fieldType: match?.field_type ?? fb.fieldType,
    placeholder: match?.placeholder ?? fb.placeholder,
    required: match?.required ?? fb.required,
    options: dbOptions && dbOptions.length > 0 ? dbOptions : fb.options ?? [],
  };
}

// Format phone as (416) 555-1234
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Validate (XXX) XXX-XXXX format
function isValidPhone(v: string) {
  return /^\(\d{3}\) \d{3}-\d{4}$/.test(v.trim());
}

// Canadian postal code: A1A 1A1 or A1A1A1
function isValidPostalCode(v: string) {
  return /^[A-Za-z]\d[A-Za-z][\s-]?\d[A-Za-z]\d$/.test(v.trim());
}

function validate(data: FormData): FormErrors {
  const e: FormErrors = {};
  if (!data.phone.trim()) e.phone = "Phone number is required.";
  else if (!isValidPhone(data.phone)) e.phone = "Enter a valid phone number in (416) 555-1234 format.";
  if (!data.streetAddress.trim()) e.streetAddress = "Street address is required.";
  if (!data.city.trim()) e.city = "City is required.";
  else if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s''-]+$/.test(data.city.trim())) e.city = "City name is not valid.";
  else if (data.city.trim().length < 2) e.city = "City name is too short.";
  if (!data.postalCode.trim()) e.postalCode = "Postal code is required.";
  else if (!isValidPostalCode(data.postalCode)) e.postalCode = "Enter a valid Canadian postal code (e.g. M1B 3C6).";
  if (!data.maritalStatus) e.maritalStatus = "Please select your marital status.";
  if (!data.propertyUse) e.propertyUse = "Please select the property use.";
  if (!data.previouslyOwned) e.previouslyOwned = "Please answer this question.";
  if (!data.citizenshipStatus) e.citizenshipStatus = "Please select your citizenship status.";
  if (!data.livedOutsideCanada) e.livedOutsideCanada = "Please answer this question.";
  if (!data.occupation.trim()) e.occupation = "Occupation is required.";
  if (data.employerPhone.trim() && !isValidPhone(data.employerPhone))
    e.employerPhone = "Enter a valid phone number in (416) 555-1234 format.";
  if (!data.sourceOfFunds.trim()) e.sourceOfFunds = "Please describe your source of funds.";
  if (!data.signingMethod) e.signingMethod = "Please select a signing method.";
  return e;
}

// ── Small reusable pieces ─────────────────────────────────────────────────────

function FieldLabel({
  label,
  htmlFor,
  required,
  tooltip,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  tooltip?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-2">
      {label}
      {required && <span className="text-[#C10007]">*</span>}
      {tooltip && (
        <span title={tooltip} className="cursor-help text-gray-400 hover:text-gray-600 transition-colors">
          <Info size={14} strokeWidth={2} />
        </span>
      )}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1.5 text-xs text-[#C10007]">{msg}</p>;
}

const inputBase =
  "w-full px-4 py-3 text-sm text-gray-900 bg-white border rounded-lg outline-none transition-colors duration-150 placeholder:text-gray-400";
const inputNormal = "border-gray-200 focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10";
const inputError = "border-[#C10007] ring-2 ring-[#C10007]/10";

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  error,
  type = "text",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  type?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={[inputBase, error ? inputError : inputNormal].join(" ")}
    />
  );
}

function SelectInput({
  id,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  error?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={[
        inputBase,
        error ? inputError : inputNormal,
        "appearance-none cursor-pointer",
        !value ? "text-gray-400" : "text-gray-900",
      ].join(" ")}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 14px center",
        paddingRight: "40px",
      }}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PersonalInformationDrawer({
  open,
  onClose,
  property,
  taskId,
  onSaved,
}: PersonalInformationDrawerProps) {
  const [form, setForm] = useState<FormData>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [dbFields, setDbFields] = useState<DbField[]>([]);

  // Fetch DB-driven field definitions (labels, options, required, field_id) for this task.
  // On failure or missing template, the drawer falls back to SLOT_FALLBACKS so UI still renders.
  useEffect(() => {
    if (!open || !taskId) return;
    let cancelled = false;
    fetch(`/api/task-form-fields?task_id=${encodeURIComponent(taskId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success && Array.isArray(j.fields)) {
          setDbFields(j.fields as DbField[]);
        }
      })
      .catch(() => {
        /* fallback lists render */
      });
    return () => {
      cancelled = true;
    };
  }, [open, taskId]);

  // Initialize form with property data when opened
  useEffect(() => {
    if (open) {
      setForm((prev) => ({
        ...EMPTY,
        ...prev, // preserve any already entered data if any
        phone: prev.phone || property?.phone || "",
        streetAddress: prev.streetAddress || property?.address_street || "",
        city: prev.city || property?.address_city || "",
        postalCode: prev.postalCode || property?.address_postal_code || "",
      }));
    }
  }, [open, property]);

  // Close on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) handleClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleClose() {
    setForm(EMPTY);
    setErrors({});
    onClose();
  }

  // Resolve every slot (label, options, field_id, required) from DB fields with safe fallbacks.
  const slots: Record<SlotKey, ResolvedSlot> = {
    phone: resolveSlot("phone", dbFields),
    streetAddress: resolveSlot("streetAddress", dbFields),
    city: resolveSlot("city", dbFields),
    postalCode: resolveSlot("postalCode", dbFields),
    maritalStatus: resolveSlot("maritalStatus", dbFields),
    propertyUse: resolveSlot("propertyUse", dbFields),
    previouslyOwned: resolveSlot("previouslyOwned", dbFields),
    citizenshipStatus: resolveSlot("citizenshipStatus", dbFields),
    livedOutsideCanada: resolveSlot("livedOutsideCanada", dbFields),
    occupation: resolveSlot("occupation", dbFields),
    employerPhone: resolveSlot("employerPhone", dbFields),
    sourceOfFunds: resolveSlot("sourceOfFunds", dbFields),
    signingMethod: resolveSlot("signingMethod", dbFields),
  };

  async function handleSave(asDraft = false) {
    if (!asDraft) {
      const errs = validate(form);
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        // Scroll to first error
        const firstId = Object.keys(errs)[0];
        document.getElementById(firstId)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }

    if (!taskId) {
      console.warn("No task ID provided to save against.");
      return;
    }

    if (asDraft) setSavingDraft(true);
    else setSaving(true);

    try {
      const mk = (key: SlotKey, value: string) => ({
        field_id: slots[key].id,
        field_label: slots[key].label,
        field_type: slots[key].fieldType,
        value,
      });

      const responses = [
        mk("phone", form.phone),
        mk("streetAddress", form.streetAddress),
        mk("city", form.city),
        mk("postalCode", form.postalCode),
        mk("maritalStatus", form.maritalStatus),
        mk("propertyUse", form.propertyUse),
        mk("previouslyOwned", form.previouslyOwned),
        mk("citizenshipStatus", form.citizenshipStatus),
        mk("livedOutsideCanada", form.livedOutsideCanada),
        mk("occupation", form.occupation),
        mk("employerPhone", form.employerPhone),
        mk("sourceOfFunds", form.sourceOfFunds),
        mk("signingMethod", form.signingMethod),
      ];

      const res = await fetch("/api/task-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          responses,
        })
      });

      if (!res.ok) {
        throw new Error("Failed to save personal information replies.");
      }

      if (onSaved && !asDraft) {
        onSaved();
      }

      handleClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
      setSavingDraft(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          "fixed inset-0 z-40 bg-black/30 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={[
          "fixed top-0 right-0 z-50 h-full w-full max-w-[520px] bg-white shadow-2xl",
          "flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label="Personal Information"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-base font-bold text-gray-900 leading-snug">
              Personal Information
            </h2>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Please provide your personal information for the property purchase.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="cursor-pointer flex-shrink-0 rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* Phone number */}
          <div>
            <FieldLabel label={slots.phone.label} htmlFor="phone" required={slots.phone.required} />
            <TextInput
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(v) => set("phone", formatPhone(v))}
              placeholder={slots.phone.placeholder ?? "(416) 555-1234"}
              error={errors.phone}
            />
            <FieldError msg={errors.phone} />
          </div>

          {/* Current address */}
          <div>
            <p className="text-sm font-bold text-gray-900 mb-3">Current address</p>
            <div className="space-y-3">
              <div>
                <FieldLabel label={slots.streetAddress.label} htmlFor="streetAddress" required={slots.streetAddress.required} />
                <TextInput
                  id="streetAddress"
                  value={form.streetAddress}
                  onChange={(v) => set("streetAddress", v)}
                  placeholder={slots.streetAddress.placeholder ?? "e.g. 10 Milner Business Court"}
                  error={errors.streetAddress}
                />
                <FieldError msg={errors.streetAddress} />
              </div>
              <div>
                <FieldLabel label={slots.city.label} htmlFor="city" required={slots.city.required} />
                <TextInput
                  id="city"
                  value={form.city}
                  onChange={(v) => set("city", v)}
                  placeholder={slots.city.placeholder ?? "e.g. Toronto"}
                  error={errors.city}
                />
                <FieldError msg={errors.city} />
              </div>
              <div>
                <FieldLabel label={slots.postalCode.label} htmlFor="postalCode" required={slots.postalCode.required} />
                <TextInput
                  id="postalCode"
                  value={form.postalCode}
                  onChange={(v) => set("postalCode", v)}
                  placeholder={slots.postalCode.placeholder ?? "e.g. M1B 3C6"}
                  error={errors.postalCode}
                />
                <FieldError msg={errors.postalCode} />
              </div>
            </div>
          </div>

          {/* Marital Status */}
          <div>
            <FieldLabel label={slots.maritalStatus.label} htmlFor="maritalStatus" required={slots.maritalStatus.required} />
            <SelectInput
              id="maritalStatus"
              value={form.maritalStatus}
              onChange={(v) => set("maritalStatus", v)}
              placeholder={slots.maritalStatus.placeholder ?? "Select marital status"}
              error={errors.maritalStatus}
              options={slots.maritalStatus.options}
            />
            <FieldError msg={errors.maritalStatus} />
          </div>

          {/* Primary residence or investment */}
          <div>
            <FieldLabel
              label={slots.propertyUse.label}
              htmlFor="propertyUse"
              required={slots.propertyUse.required}
              tooltip="This affects your eligibility for certain tax rebates and programs."
            />
            <SelectInput
              id="propertyUse"
              value={form.propertyUse}
              onChange={(v) => set("propertyUse", v)}
              placeholder={slots.propertyUse.placeholder ?? "Select property use"}
              error={errors.propertyUse}
              options={slots.propertyUse.options}
            />
            <FieldError msg={errors.propertyUse} />
          </div>

          {/* Previously owned */}
          <div>
            <FieldLabel
              label={slots.previouslyOwned.label}
              htmlFor="previouslyOwned"
              required={slots.previouslyOwned.required}
              tooltip="First-time homebuyers may qualify for land transfer tax rebates."
            />
            <SelectInput
              id="previouslyOwned"
              value={form.previouslyOwned}
              onChange={(v) => set("previouslyOwned", v)}
              placeholder={slots.previouslyOwned.placeholder ?? "Select an option"}
              error={errors.previouslyOwned}
              options={slots.previouslyOwned.options}
            />
            <FieldError msg={errors.previouslyOwned} />
          </div>

          {/* Citizenship status */}
          <div>
            <FieldLabel
              label={slots.citizenshipStatus.label}
              htmlFor="citizenshipStatus"
              required={slots.citizenshipStatus.required}
              tooltip="Required for government reporting and tax purposes."
            />
            <SelectInput
              id="citizenshipStatus"
              value={form.citizenshipStatus}
              onChange={(v) => set("citizenshipStatus", v)}
              placeholder={slots.citizenshipStatus.placeholder ?? "Select citizenship status"}
              error={errors.citizenshipStatus}
              options={slots.citizenshipStatus.options}
            />
            <FieldError msg={errors.citizenshipStatus} />
          </div>

          {/* Lived outside Canada */}
          <div>
            <FieldLabel
              label={slots.livedOutsideCanada.label}
              htmlFor="livedOutsideCanada"
              required={slots.livedOutsideCanada.required}
              tooltip="This may affect applicable taxes under the Non-Resident Speculation Tax (NRST)."
            />
            <SelectInput
              id="livedOutsideCanada"
              value={form.livedOutsideCanada}
              onChange={(v) => set("livedOutsideCanada", v)}
              placeholder={slots.livedOutsideCanada.placeholder ?? "Select an option"}
              error={errors.livedOutsideCanada}
              options={slots.livedOutsideCanada.options}
            />
            <FieldError msg={errors.livedOutsideCanada} />
          </div>

          {/* Occupation */}
          <div>
            <FieldLabel
              label={slots.occupation.label}
              htmlFor="occupation"
              required={slots.occupation.required}
              tooltip="Used for identity verification purposes."
            />
            <TextInput
              id="occupation"
              value={form.occupation}
              onChange={(v) => set("occupation", v)}
              placeholder={slots.occupation.placeholder ?? "e.g. Engineer"}
              error={errors.occupation}
            />
            <FieldError msg={errors.occupation} />
          </div>

          {/* Employer phone */}
          <div>
            <FieldLabel
              label={slots.employerPhone.label}
              htmlFor="employerPhone"
              required={slots.employerPhone.required}
              tooltip="Optional — provide if you are employed."
            />
            <TextInput
              id="employerPhone"
              type="tel"
              value={form.employerPhone}
              onChange={(v) => set("employerPhone", formatPhone(v))}
              placeholder={slots.employerPhone.placeholder ?? "(416) 555-1234"}
              error={errors.employerPhone}
            />
            <FieldError msg={errors.employerPhone} />
          </div>

          {/* Source of funds */}
          <div>
            <FieldLabel
              label={slots.sourceOfFunds.label}
              htmlFor="sourceOfFunds"
              required={slots.sourceOfFunds.required}
              tooltip="Required under anti-money laundering regulations."
            />
            <textarea
              id="sourceOfFunds"
              value={form.sourceOfFunds}
              onChange={(e) => set("sourceOfFunds", e.target.value)}
              placeholder={slots.sourceOfFunds.placeholder ?? "e.g. Employment income, savings, gift from family..."}
              rows={3}
              className={[
                inputBase,
                errors.sourceOfFunds ? inputError : inputNormal,
                "resize-none",
              ].join(" ")}
            />
            <FieldError msg={errors.sourceOfFunds} />
          </div>

          {/* Signing method */}
          <div>
            <FieldLabel
              label={slots.signingMethod.label}
              htmlFor="signingMethod"
              required={slots.signingMethod.required}
            />
            <SelectInput
              id="signingMethod"
              value={form.signingMethod}
              onChange={(v) => set("signingMethod", v)}
              placeholder={slots.signingMethod.placeholder ?? "Select signing method"}
              error={errors.signingMethod}
              options={slots.signingMethod.options}
            />
            <FieldError msg={errors.signingMethod} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-3">
          <Button
            variant="secondary"
            fullWidth
            loading={savingDraft}
            disabled={saving}
            onClick={() => handleSave(true)}
            className="sm:flex-1"
          >
            Save as Draft
          </Button>
          <Button
            variant="primary"
            fullWidth
            loading={saving}
            disabled={savingDraft}
            onClick={() => handleSave(false)}
            className="sm:flex-1 bg-[#C10007] hover:bg-[#a30006]"
          >
            Save &amp; Continue
          </Button>
        </div>
      </div>
    </>
  );
}
