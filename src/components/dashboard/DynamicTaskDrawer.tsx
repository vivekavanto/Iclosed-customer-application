"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  Upload,
  Trash2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  CalendarCheck,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface FieldOption {
  label: string;
  value: string;
}

interface FormField {
  id: string;
  field_type:
    | "text"
    | "phone"
    | "email"
    | "select"
    | "textarea"
    | "file"
    | "checkbox"
    | "date";
  label: string;
  placeholder: string | null;
  required: boolean;
  order_index: number;
  options:
    | FieldOption[]
    | { accept?: string; max_mb?: number; doc_type?: string }
    | null;
}

interface ExistingResponse {
  field_id: string | null;
  field_label: string;
  value: string | null;
  file_url: string | null;
  file_name: string | null;
}

interface DynamicTaskDrawerProps {
  open: boolean;
  onClose: () => void;
  taskId: string | null;
  taskTitle: string;
  leadId?: string;
  onTaskCompleted?: (taskId: string) => void;
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function isSelectOptions(opts: any): opts is FieldOption[] {
  return Array.isArray(opts);
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

// Validate email format
function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function getFileConfig(opts: any): {
  accept: string;
  max_mb: number;
  doc_type: string;
} {
  return {
    accept: opts?.accept ?? ".pdf,.jpg,.jpeg,.png",
    max_mb: opts?.max_mb ?? 10,
    doc_type: opts?.doc_type ?? "document",
  };
}

const inputBase =
  "w-full px-4 py-3 text-sm text-gray-900 bg-white border rounded-lg outline-none transition-colors duration-150 placeholder:text-gray-400 placeholder:text-xs";
const inputNormal =
  "border-gray-200 focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10";
const inputError = "border-[#C10007] ring-2 ring-[#C10007]/10";

/* ─────────────────────────────────────────────
   SINGLE FILE UPLOAD SLOT
───────────────────────────────────────────── */
function FileSlot({
  field,
  file,
  existingUrl,
  existingName,
  error,
  onFile,
  onClear,
  onError,
}: {
  field: FormField;
  file: File | null;
  existingUrl: string | null;
  existingName: string | null;
  error: string | null;
  onFile: (fieldId: string, file: File) => void;
  onClear: (fieldId: string) => void;
  onError?: (fieldId: string, error: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const cfg = getFileConfig(field.options);

  function validateFile(f: File): string | null {
    const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
    const allowed = cfg.accept.split(",").map((s) => s.trim());
    if (!allowed.includes(ext))
      return `Invalid file type. Only ${cfg.accept.replace(/\./g, "").toUpperCase()} files are allowed.`;
    if (f.size > cfg.max_mb * 1024 * 1024)
      return `File size (${(f.size / 1024 / 1024).toFixed(1)}MB) exceeds the ${cfg.max_mb}MB limit.`;
    return null;
  }

  function handlePick(f: File) {
    const err = validateFile(f);
    if (err) {
      onError?.(field.id, err);
    } else {
      onError?.(field.id, "");
      onFile(field.id, f);
    }
  }

  if (existingUrl && !file) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-green-300 bg-green-50 p-5 text-center">
        <CheckCircle2 size={22} className="text-green-600" strokeWidth={2} />
        <div>
          <p className="text-sm font-semibold text-green-700">
            {existingName ?? "File uploaded"}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Previously submitted
          </p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={11} strokeWidth={2.5} /> Replace
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={cfg.accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handlePick(f);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {file.name}
          </p>
          <p className="text-xs text-gray-400">
            {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
        </div>
        <button
          onClick={() => onClear(field.id)}
          className="cursor-pointer w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-[#C10007] hover:border-red-200 transition-colors"
        >
          <Trash2 size={13} strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handlePick(f);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className={[
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200 select-none",
          dragOver
            ? "border-[#C10007] bg-[#FEF2F2]"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
        ].join(" ")}
      >
        <div
          className={[
            "w-9 h-9 rounded-full flex items-center justify-center",
            dragOver ? "bg-[#FEF2F2]" : "bg-gray-100",
          ].join(" ")}
        >
          <Upload
            size={16}
            className={dragOver ? "text-[#C10007]" : "text-gray-400"}
            strokeWidth={2}
          />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700">{field.label}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Click or drag · {cfg.accept} · Max {cfg.max_mb}MB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={cfg.accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handlePick(f);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-[#C10007]">
          <AlertCircle size={11} />
          {error}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   CUSTOM SELECT (fixed-position dropdown)
───────────────────────────────────────────── */
function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  options: FieldOption[];
  placeholder: string;
  hasError: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openDropdown = useCallback(() => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className={[
          "w-full text-left px-4 py-3 text-sm rounded-lg border outline-none flex items-center justify-between transition-colors",
          hasError
            ? "border-[#C10007] ring-2 ring-[#C10007]/10"
            : open
              ? "border-[#C10007] ring-2 ring-[#C10007]/10"
              : "border-gray-200 hover:border-gray-300",
          selected ? "text-gray-900" : "text-gray-400",
        ].join(" ")}
      >
        <span className={`truncate ${selected ? "text-sm" : "text-xs text-gray-400"}`}>{selected ? selected.label : placeholder}</span>
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && rect && (
        <div
          className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-xl py-1 overflow-y-auto"
          style={{
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
            maxHeight: 220,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onMouseDown={() => { onChange(o.value); setOpen(false); }}
              className={[
                "w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-50",
                o.value === value ? "font-semibold text-[#C10007] bg-[#FEF2F2]" : "text-gray-700",
              ].join(" ")}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN DRAWER
───────────────────────────────────────────── */
export default function DynamicTaskDrawer({
  open,
  onClose,
  taskId,
  taskTitle,
  leadId,
  onTaskCompleted,
}: DynamicTaskDrawerProps) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);

  // text/select/textarea values
  const [values, setValues] = useState<Record<string, string>>({});
  // file slots: fieldId → File
  const [files, setFiles] = useState<Record<string, File>>({});
  // existing file responses (pre-fill)
  const [existingFiles, setExistingFiles] = useState<
    Record<string, { url: string; name: string }>
  >({});
  // file upload errors
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  // field validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const CALENDLY_URL = "https://calendly.com/iclosed-navawilson/iclosed-lead-meeting";

  // ── Fetch fields when drawer opens ──
  useEffect(() => {
    if (!open || !taskId) return;
    setFieldsLoading(true);
    setValues({});
    setFiles({});
    setExistingFiles({});
    setErrors({});
    setFileErrors({});
    setGlobalError(null);
    setSaved(false);
    setDraftSaved(false);

    fetch(`/api/task-form-fields?task_id=${taskId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setFields(data.fields ?? []);
          // Pre-fill existing text responses
          const preValues: Record<string, string> = {};
          const preFiles: Record<string, { url: string; name: string }> = {};
          (data.existing_responses ?? []).forEach((resp: ExistingResponse) => {
            if (resp.field_id) {
              if (resp.value) preValues[resp.field_id] = resp.value;
              if (resp.file_url)
                preFiles[resp.field_id] = {
                  url: resp.file_url,
                  name: resp.file_name ?? "",
                };
            }
          });
          setValues(preValues);
          setExistingFiles(preFiles);
        }
      })
      .catch(() => setGlobalError("Failed to load form fields."))
      .finally(() => setFieldsLoading(false));
  }, [open, taskId]);

  // ── Escape key & scroll lock ──
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) handleClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function handleClose() {
    setSaved(false);
    setDraftSaved(false);
    onClose();
  }

  function setValue(fieldId: string, value: string) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) setErrors((prev) => ({ ...prev, [fieldId]: "" }));
  }

  function setFile(fieldId: string, file: File) {
    setFiles((prev) => ({ ...prev, [fieldId]: file }));
    setFileErrors((prev) => ({ ...prev, [fieldId]: "" }));
  }

  function clearFile(fieldId: string) {
    setFiles((prev) => {
      const n = { ...prev };
      delete n[fieldId];
      return n;
    });
    setExistingFiles((prev) => {
      const n = { ...prev };
      delete n[fieldId];
      return n;
    });
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const field of fields) {
      const val = values[field.id]?.trim() ?? "";

      if (field.field_type === "file") {
        if (field.required && !files[field.id] && !existingFiles[field.id]) {
          newErrors[field.id] = `${field.label} is required.`;
        }
      } else if (field.field_type === "checkbox") {
        if (field.required && values[field.id] !== "true") {
          newErrors[field.id] = `${field.label} is required.`;
        }
      } else if (field.field_type === "email") {
        if (field.required && !val) {
          newErrors[field.id] = `${field.label} is required.`;
        } else if (val && !isValidEmail(val)) {
          newErrors[field.id] = "Enter a valid email address.";
        }
      } else if (field.field_type === "phone") {
        if (field.required && !val) {
          newErrors[field.id] = `${field.label} is required.`;
        } else if (val && !isValidPhone(val)) {
          newErrors[field.id] = "Enter a valid phone number in (416) 555-1234 format.";
        }
      } else {
        if (field.required && !val) {
          newErrors[field.id] = `${field.label} is required.`;
        }
      }
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      const first = Object.keys(newErrors)[0];
      document
        .getElementById(`field-${first}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (!taskId) return;

    if (!validate()) return;

    setSaving(true);
    setGlobalError(null);

    try {
      // ── 1. Upload any new files ──
      const fileResponses: Array<{
        field_id: string;
        field_label: string;
        field_type: string;
        file_url: string;
        file_name: string;
      }> = [];

      for (const field of fields.filter((f) => f.field_type === "file")) {
        const file = files[field.id];
        if (!file) continue; // no new file for this slot

        const cfg = getFileConfig(field.options);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("lead_id", leadId ?? "unknown");
        fd.append("doc_type", cfg.doc_type);

        const res = await fetch("/api/uploadblobstorage", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!data.success)
          throw new Error(`Upload failed for "${field.label}": ${data.error}`);

        fileResponses.push({
          field_id: field.id,
          field_label: field.label,
          field_type: "file",
          file_url: data.url ?? data.file_url,
          file_name: file.name,
        });
      }

      // ── 2. Build text/select/textarea responses ──
      const textResponses = fields
        .filter((f) => f.field_type !== "file" && f.field_type !== "checkbox")
        .map((f) => ({
          field_id: f.id,
          field_label: f.label,
          field_type: f.field_type,
          value: values[f.id] ?? "",
        }));

      // ── 3. Checkbox responses ──
      const checkboxResponses = fields
        .filter((f) => f.field_type === "checkbox")
        .map((f) => ({
          field_id: f.id,
          field_label: f.label,
          field_type: "checkbox",
          value: values[f.id] === "true" ? "true" : "false",
        }));

      // ── 4. Keep existing file responses that weren't replaced ──
      const existingFileResponses = Object.entries(existingFiles)
        .filter(([fieldId]) => !files[fieldId]) // not replaced by new file
        .map(([fieldId, info]) => {
          const field = fields.find((f) => f.id === fieldId);
          return {
            field_id: fieldId,
            field_label: field?.label ?? "",
            field_type: "file",
            file_url: info.url,
            file_name: info.name,
          };
        });

      const allResponses = [
        ...textResponses,
        ...fileResponses,
        ...existingFileResponses,
        ...checkboxResponses,
      ];

      // ── 5. Submit to task-responses ──
      const res = await fetch("/api/task-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, responses: allResponses }),
      });
      const result = await res.json();
      if (!result.success)
        throw new Error(result.error ?? "Failed to save responses.");

      setSaved(true);
      onTaskCompleted?.(taskId);

      // Auto-close after 1.5s
      setTimeout(() => handleClose(), 1500);
    } catch (err: any) {
      setGlobalError(err.message ?? "An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    if (!taskId) return;
    setSavingDraft(true);
    setGlobalError(null);

    try {
      // Save text/select/textarea responses without validation
      const textResponses = fields
        .filter((f) => f.field_type !== "file" && f.field_type !== "checkbox")
        .filter((f) => values[f.id]?.trim())
        .map((f) => ({
          field_id: f.id,
          field_label: f.label,
          field_type: f.field_type,
          value: values[f.id] ?? "",
        }));

      // Keep existing file responses
      const existingFileResponses = Object.entries(existingFiles)
        .map(([fieldId, info]) => {
          const field = fields.find((f) => f.id === fieldId);
          return {
            field_id: fieldId,
            field_label: field?.label ?? "",
            field_type: "file",
            file_url: info.url,
            file_name: info.name,
          };
        });

      const allResponses = [...textResponses, ...existingFileResponses];

      if (allResponses.length > 0) {
        const res = await fetch("/api/task-responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: taskId, responses: allResponses, draft: true }),
        });
        const result = await res.json();
        if (!result.success)
          throw new Error(result.error ?? "Failed to save draft.");
      }

      setDraftSaved(true);
      setTimeout(() => handleClose(), 1500);
    } catch (err: any) {
      setGlobalError(err.message ?? "An error occurred. Please try again.");
    } finally {
      setSavingDraft(false);
    }
  }

  const isCalendlyTask = taskTitle.toLowerCase().includes("schedule an appointment");
  const hasFileFields = fields.some((f) => f.field_type === "file");
  const isPersonalInfoTask = taskTitle.toLowerCase().includes("provide personal information");
  const isMortgageTask = taskTitle.toLowerCase().includes("status of mortgage");
  const hasDraftOption = isPersonalInfoTask || isMortgageTask;

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          "fixed inset-0 z-40 bg-black/30 transition-opacity duration-300",
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
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
        aria-label={taskTitle}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-base font-bold text-gray-900 leading-snug">
              {taskTitle}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {taskTitle.toLowerCase().includes("upload identification")
                ? "Upload your identification documents to verify your identity for the property transaction."
                : hasFileFields
                  ? "Upload the required documents to complete this task."
                  : isCalendlyTask
                    ? "Book your appointment and confirm below."
                    : "Fill in the required information to complete this task."}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* ── Home Insurance static sections ── */}
          {taskTitle.toLowerCase().includes("home insurance") && (
            <>
              {/* Policy Requirements Checklist */}
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-bold text-gray-900 mb-3">Policy Requirements Checklist</p>
                <ul className="space-y-2">
                  {[
                    "Policy effective date matches or precedes closing date",
                    "Coverage amount meets lender requirements",
                    "Property address matches purchase agreement",
                    "Lender listed as mortgagee (if applicable)",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0 mt-1.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* ── Upload Identification static sections ── */}
          {taskTitle.toLowerCase().includes("upload identification") && (
            <>
              {/* Upload status */}
              {(() => {
                const idFields = fields.filter((f) => f.field_type === "file");
                const uploaded = idFields.filter(
                  (f) => files[f.id] || existingFiles[f.id]
                ).length;
                const total = idFields.length || 4;
                const allDone = uploaded === total && total > 0;
                return (
                  <div
                    className={`flex items-center gap-2 rounded-lg px-4 py-3 text-xs font-semibold ${
                      allDone
                        ? "bg-green-50 border border-green-200 text-green-700"
                        : "bg-amber-50 border border-amber-200 text-amber-700"
                    }`}
                  >
                    {allDone ? (
                      <CheckCircle2 size={14} strokeWidth={2.5} />
                    ) : (
                      <AlertCircle size={14} strokeWidth={2.5} />
                    )}
                    Upload Status: {uploaded} of {total} required documents uploaded
                    {allDone && " - Task Complete!"}
                  </div>
                );
              })()}

              {/* Why is Identification Required? */}
              <div className="rounded-xl border-l-4 border-l-[#C10007] border border-[#fca5a5] bg-[#FEF2F2] px-5 py-4">
                <p className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <AlertCircle size={15} className="text-[#C10007]" strokeWidth={2} />
                  Why is Identification Required?
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Government-issued identification is required to verify your identity and comply with legal requirements for property transactions.
                </p>
                <p className="text-xs text-gray-600 leading-relaxed mt-2">
                  This helps prevent fraud and ensures all parties are properly identified before proceeding with the closing.
                </p>
              </div>

              {/* Required Documents */}
              <div>
                <p className="text-sm font-bold text-gray-900 mb-3">Required Documents</p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C10007] flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-xs font-bold text-gray-900">Primary ID:</p>
                      <p className="text-xs text-gray-500">Valid passport, citizenship card, or permanent resident card</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C10007] flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-xs font-bold text-gray-900">Secondary ID:</p>
                      <p className="text-xs text-gray-500">Driver&apos;s license, provincial photo card, or SIN card (not paper version)</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C10007] flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-xs font-bold text-gray-900">Important Note:</p>
                      <p className="text-xs text-gray-500">Health card is not a valid government ID</p>
                    </div>
                  </li>
                </ul>
              </div>
            </>
          )}

          {/* Success state */}
          {saved && (
            <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-4 py-4">
              <CheckCircle2
                size={20}
                className="text-green-600 flex-shrink-0"
                strokeWidth={2}
              />
              <div>
                <p className="text-sm font-bold text-green-700">
                  Submitted successfully!
                </p>
                <p className="text-xs text-green-600 mt-0.5">
                  Your response has been saved.
                </p>
              </div>
            </div>
          )}

          {/* Draft saved state */}
          {draftSaved && !saved && (
            <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-4">
              <CheckCircle2
                size={20}
                className="text-blue-600 flex-shrink-0"
                strokeWidth={2}
              />
              <div>
                <p className="text-sm font-bold text-blue-700">
                  Draft saved!
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Your progress has been saved. You can continue later.
                </p>
              </div>
            </div>
          )}

          {/* Loading state */}
          {fieldsLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="text-gray-300 animate-spin" />
            </div>
          )}

          {/* No fields found */}
          {!fieldsLoading && fields.length === 0 && !saved && !draftSaved && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
                <CheckCircle2
                  size={22}
                  className="text-gray-300"
                  strokeWidth={1.5}
                />
              </div>
              <p className="text-sm text-gray-500 font-medium">
                No form required
              </p>
              <p className="text-xs text-gray-400">
                Mark this task as done using the checkbox on the dashboard.
              </p>
            </div>
          )}

          {/* Calendly link (special case for Schedule Appointment) */}
          {!fieldsLoading && isCalendlyTask && (
            <div className="rounded-xl border border-[#fca5a5] bg-[#FEF2F2] border-l-4 border-l-[#C10007] px-5 py-4 space-y-3">
              <p className="text-sm font-bold text-gray-900">
                Book Your Appointment
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Click the link below to choose your preferred date and time.
              </p>
              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
              >
                <CalendarCheck
                  size={15}
                  className="text-[#C10007]"
                  strokeWidth={2}
                />
                Open Calendly to Schedule
              </a>
            </div>
          )}

          {/* Render dynamic fields */}
          {!fieldsLoading &&
            fields.map((field) => {
              const isIdTask = taskTitle.toLowerCase().includes("upload identification");
              const fileFields = fields.filter((f) => f.field_type === "file");
              const fileIdx = fileFields.indexOf(field);

              if (field.field_type === "file") {
                // Section headers for identification task
                const showPrimaryHeader = isIdTask && fileIdx === 0;
                const showSecondaryHeader = isIdTask && fileIdx === 2;

                return (
                  <div key={field.id}>
                    {showPrimaryHeader && (
                      <div className="mb-3">
                        <p className="text-sm font-bold text-gray-900">Upload Primary Identification (Front and Back)</p>
                        <p className="text-xs text-gray-400 mt-0.5">Passport, Citizenship Card, or Permanent Resident Card</p>
                      </div>
                    )}
                    {showSecondaryHeader && (
                      <div className="mb-3 mt-2">
                        <p className="text-sm font-bold text-gray-900">Upload Secondary Identification (Required - Front and Back)</p>
                        <p className="text-xs text-gray-400 mt-0.5">Driver&apos;s License, Provincial Photo Card, or SIN Card (not paper version)</p>
                      </div>
                    )}
                    <label className="text-sm font-semibold text-gray-800 mb-2 block">
                      {field.label}
                      {field.required && (
                        <span className="text-[#C10007] ml-1">*</span>
                      )}
                    </label>
                    <FileSlot
                      field={field}
                      file={files[field.id] ?? null}
                      existingUrl={existingFiles[field.id]?.url ?? null}
                      existingName={existingFiles[field.id]?.name ?? null}
                      error={fileErrors[field.id] ?? null}
                      onFile={setFile}
                      onClear={clearFile}
                      onError={(id, err) => setFileErrors((prev) => ({ ...prev, [id]: err }))}
                    />
                    {errors[field.id] && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-[#C10007]">
                        <AlertCircle size={11} />
                        {errors[field.id]}
                      </p>
                    )}
                  </div>
                );
              }

              if (field.field_type === "checkbox") {
                const isChecked = values[field.id] === "true";
                return (
                  <div key={field.id} id={`field-${field.id}`}>
                    <label
                      className="flex items-start gap-3 cursor-pointer group select-none"
                    >
                      <div className="relative flex-shrink-0 mt-0.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setValue(field.id, e.target.checked ? "true" : "false")
                          }
                          className="sr-only"
                        />
                        <div
                          className={[
                            "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                            isChecked
                              ? "bg-[#C10007] border-[#C10007]"
                              : "border-gray-300 bg-white group-hover:border-[#C10007]/60",
                          ].join(" ")}
                        >
                          {isChecked && (
                            <svg
                              width="10"
                              height="8"
                              viewBox="0 0 10 8"
                              fill="none"
                            >
                              <path
                                d="M1 4L3.5 6.5L9 1"
                                stroke="white"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                      </div>
                      <span
                        className={[
                          "text-sm leading-snug pt-0.5",
                          isChecked
                            ? "text-gray-800 font-medium"
                            : "text-gray-500",
                        ].join(" ")}
                      >
                        {field.placeholder || field.label}
                      </span>
                    </label>
                    {errors[field.id] && (
                      <p className="mt-1.5 text-xs text-[#C10007]">
                        {errors[field.id]}
                      </p>
                    )}
                  </div>
                );
              }

              if (field.field_type === "select") {
                const opts = isSelectOptions(field.options)
                  ? field.options
                  : [];
                return (
                  <div key={field.id} id={`field-${field.id}`}>
                    <label className="text-sm font-semibold text-gray-800 mb-2 block">
                      {field.label}
                      {field.required && (
                        <span className="text-[#C10007] ml-1">*</span>
                      )}
                    </label>
                    <select
                      value={values[field.id] ?? ""}
                      onChange={(e) => setValue(field.id, e.target.value)}
                      className={[
                        inputBase,
                        errors[field.id] ? inputError : inputNormal,
                        "appearance-none cursor-pointer",
                        !values[field.id] ? "text-gray-400 text-xs" : "text-gray-900 text-sm",
                      ].join(" ")}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 14px center",
                        paddingRight: "40px",
                      }}
                    >
                      <option value="" disabled>
                        {field.placeholder ?? `Select ${field.label}`}
                      </option>
                      {opts.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {errors[field.id] && (
                      <p className="mt-1.5 text-xs text-[#C10007]">
                        {errors[field.id]}
                      </p>
                    )}
                  </div>
                );
              }

              if (field.field_type === "textarea") {
                return (
                  <div key={field.id} id={`field-${field.id}`}>
                    <label className="text-sm font-semibold text-gray-800 mb-2 block">
                      {field.label}
                      {field.required && (
                        <span className="text-[#C10007] ml-1">*</span>
                      )}
                    </label>
                    <textarea
                      value={values[field.id] ?? ""}
                      onChange={(e) => setValue(field.id, e.target.value)}
                      placeholder={field.placeholder ?? ""}
                      rows={3}
                      className={[
                        inputBase,
                        errors[field.id] ? inputError : inputNormal,
                        "resize-none",
                      ].join(" ")}
                    />
                    {errors[field.id] && (
                      <p className="mt-1.5 text-xs text-[#C10007]">
                        {errors[field.id]}
                      </p>
                    )}
                  </div>
                );
              }

              // text / phone / email / date
              return (
                <div key={field.id} id={`field-${field.id}`}>
                  <label className="text-sm font-semibold text-gray-800 mb-2 block">
                    {field.label}
                    {field.required ? (
                      <span className="text-[#C10007] ml-1">*</span>
                    ) : (
                      <span className="text-gray-400 font-normal text-xs ml-2">(Optional)</span>
                    )}
                  </label>
                  <input
                    type={
                      field.field_type === "phone" ? "tel" : field.field_type
                    }
                    value={values[field.id] ?? ""}
                    onChange={(e) =>
                      field.field_type === "phone"
                        ? setValue(field.id, formatPhone(e.target.value))
                        : setValue(field.id, e.target.value)
                    }
                    placeholder={field.placeholder ?? (field.field_type === "phone" ? "(416) 555-1234" : "")}
                    className={[
                      inputBase,
                      errors[field.id] ? inputError : inputNormal,
                    ].join(" ")}
                  />
                  {errors[field.id] && (
                    <p className="mt-1.5 text-xs text-[#C10007]">
                      {errors[field.id]}
                    </p>
                  )}
                </div>
              );
            })}

          {/* ── Upload Identification: Document Requirements Checklist ── */}
          {taskTitle.toLowerCase().includes("upload identification") && (
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-bold text-gray-900 mb-3">Document Requirements Checklist</p>
              <ul className="space-y-2">
                {[
                  { text: "Two pieces of identification are required", highlight: "(Primary and Secondary)" },
                  { text: "Both front and back of each ID document (if applicable)", highlight: "" },
                  { text: "Documents are clear and legible", highlight: "" },
                  { text: "IDs are current and not expired", highlight: "" },
                  { text: "Names match your personal information", highlight: "" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-2 text-xs text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-900 flex-shrink-0 mt-1.5" />
                    <span>
                      {item.text}
                      {item.highlight && (
                        <span className="text-[#C10007] font-semibold"> {item.highlight}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Global error */}
          {globalError && (
            <div className="flex items-start gap-2 text-xs text-[#C10007] bg-[#FEF2F2] border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle
                size={13}
                strokeWidth={2}
                className="flex-shrink-0 mt-0.5"
              />
              <span>{globalError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {!fieldsLoading && fields.length > 0 && !saved && !draftSaved && (
          <div className="px-6 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-3">
            {hasDraftOption ? (
              <>
                <Button
                  variant="secondary"
                  fullWidth
                  loading={savingDraft}
                  disabled={saving}
                  onClick={handleSaveDraft}
                  className="sm:flex-1"
                >
                  Save as Draft
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  loading={saving}
                  disabled={savingDraft}
                  onClick={isPersonalInfoTask ? () => {
                    if (!validate()) return;
                    setShowConfirmModal(true);
                  } : handleSubmit}
                  className="sm:flex-1 bg-[#C10007] hover:bg-[#a30006]"
                >
                  Submit Information
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={handleClose}
                  disabled={saving}
                  className="sm:flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  loading={saving}
                  onClick={handleSubmit}
                  className="sm:flex-1 bg-[#C10007] hover:bg-[#a30006]"
                >
                  {isCalendlyTask
                    ? "Confirm Appointment"
                    : taskTitle.toLowerCase().includes("upload identification")
                      ? "Upload Identification Documents"
                      : hasFileFields
                        ? "Upload & Submit"
                        : "Save & Continue"}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Personal Information */}
      <Modal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        size="sm"
      >
        <div className="relative text-center py-2">
          {/* Close button */}
          <button
            onClick={() => setShowConfirmModal(false)}
            className="absolute -top-1 -right-1 p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-[#FEF2F2] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#C10007" strokeWidth="2" />
                <path d="M12 8v4" stroke="#C10007" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="1" fill="#C10007" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold text-[#C10007] mb-2">
            Important Notice
          </h3>

          {/* Message */}
          <p className="text-sm text-gray-600 leading-relaxed mb-6 px-2">
            If you need any modifications after submitting, please contact the clerks at{" "}
            <a
              href="mailto:iclosed@navawilson.law"
              className="text-blue-600 hover:underline font-medium"
            >
              iclosed@navawilson.law
            </a>{" "}
            for modifications.
          </p>

          {/* Buttons */}
          <div className="flex gap-3 px-2">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowConfirmModal(false);
                handleSubmit();
              }}
              disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[#C10007] border border-[#C10007] rounded-lg hover:bg-[#a30006] transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? "Submitting..." : "Confirm Submission"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
