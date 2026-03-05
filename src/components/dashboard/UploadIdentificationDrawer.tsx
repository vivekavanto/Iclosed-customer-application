"use client";

import { useEffect, useRef, useState } from "react";
import { X, Upload, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";

interface UploadIdentificationDrawerProps {
  open: boolean;
  onClose: () => void;
  leadId?: string;
}

type SlotKey = "primaryFront" | "primaryBack" | "secondaryFront" | "secondaryBack";

interface SlotState {
  file: File | null;
  previouslyUploaded: boolean;
  error: string | null;
}

const INITIAL_SLOTS: Record<SlotKey, SlotState> = {
  primaryFront:    { file: null, previouslyUploaded: false, error: null },
  primaryBack:     { file: null, previouslyUploaded: false, error: null },
  secondaryFront:  { file: null, previouslyUploaded: false, error: null },
  secondaryBack:   { file: null, previouslyUploaded: false, error: null },
};

const SLOT_LABELS: Record<SlotKey, string> = {
  primaryFront:   "Primary ID - Front",
  primaryBack:    "Primary ID - Back",
  secondaryFront: "Secondary ID - Front",
  secondaryBack:  "Secondary ID - Back",
};

const SLOT_DOC_TYPES: Record<SlotKey, string> = {
  primaryFront:   "id_primary_front",
  primaryBack:    "id_primary_back",
  secondaryFront: "id_secondary_front",
  secondaryBack:  "id_secondary_back",
};

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".heic"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

function validateFile(f: File): string | null {
  const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return "Only PDF, JPG, PNG, or HEIC files are allowed.";
  if (f.size > MAX_SIZE) return "File size must not exceed 10 MB.";
  return null;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Upload Slot ───────────────────────────────────────────────────────────────

function UploadSlot({
  slotKey,
  label,
  state,
  onFile,
  onClear,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  slotKey: SlotKey;
  label: string;
  state: SlotState;
  onFile: (key: SlotKey, file: File) => void;
  onClear: (key: SlotKey) => void;
  dragOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (key: SlotKey, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isUploaded = state.previouslyUploaded && !state.file;
  const hasNewFile = !!state.file;

  if (isUploaded) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-green-300 bg-green-50 p-5 text-center">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 size={20} className="text-green-600" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-sm font-semibold text-green-700">{label} Uploaded</p>
          <p className="text-xs text-gray-400 mt-0.5">Previously submitted</p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <RefreshCw size={12} strokeWidth={2.5} />
          Replace File
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.heic"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(slotKey, f);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  if (hasNewFile) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#C10007]/30 bg-[#FEF2F2] p-5 text-center">
        <div className="w-10 h-10 rounded-full bg-[#FEF2F2] border border-[#C10007]/20 flex items-center justify-center">
          <CheckCircle2 size={20} className="text-[#C10007]" strokeWidth={2.5} />
        </div>
        <div className="w-full">
          <p className="text-xs font-semibold text-[#C10007] truncate px-2">{state.file!.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{formatBytes(state.file!.size)}</p>
        </div>
        <button
          onClick={() => onClear(slotKey)}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 bg-white border border-gray-200 rounded-lg hover:text-[#C10007] hover:border-red-200 hover:bg-red-50 transition-colors"
        >
          Remove
        </button>
        {state.error && (
          <p className="text-xs text-[#C10007] flex items-center gap-1">
            <AlertCircle size={11} strokeWidth={2} />
            {state.error}
          </p>
        )}
      </div>
    );
  }

  // Empty upload zone
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDragLeave();
        const f = e.dataTransfer.files[0];
        if (f) onDrop(slotKey, f);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      className={[
        "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-all duration-200 select-none",
        dragOver
          ? "border-[#C10007] bg-[#FEF2F2]"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
      ].join(" ")}
    >
      <div className={[
        "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
        dragOver ? "bg-[#FEF2F2]" : "bg-gray-100",
      ].join(" ")}>
        <Upload size={18} className={dragOver ? "text-[#C10007]" : "text-gray-400"} strokeWidth={2} />
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-700">{label}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">Click or drag to upload</p>
        <p className="text-[10px] text-gray-400">PDF, JPG, PNG (Max 10MB)</p>
      </div>
      {state.error && (
        <p className="text-xs text-[#C10007] flex items-center gap-1">
          <AlertCircle size={11} strokeWidth={2} />
          {state.error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.heic"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(slotKey, f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function UploadIdentificationDrawer({
  open,
  onClose,
  leadId,
}: UploadIdentificationDrawerProps) {
  const [slots, setSlots] = useState<Record<SlotKey, SlotState>>(INITIAL_SLOTS);
  const [dragOverSlot, setDragOverSlot] = useState<SlotKey | null>(null);
  const [uploading, setUploading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

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

  const allKeys: SlotKey[] = ["primaryFront", "primaryBack", "secondaryFront", "secondaryBack"];

  const uploadedCount = allKeys.filter(
    (k) => slots[k].previouslyUploaded || slots[k].file
  ).length;

  const hasNewFiles = allKeys.some((k) => slots[k].file !== null);
  const isTaskComplete = uploadedCount === 4 && !hasNewFiles;

  function handleFile(key: SlotKey, file: File) {
    const err = validateFile(file);
    setSlots((prev) => ({
      ...prev,
      [key]: { ...prev[key], file: err ? null : file, error: err },
    }));
    setGlobalError(null);
  }

  function handleClear(key: SlotKey) {
    setSlots((prev) => ({
      ...prev,
      [key]: { ...prev[key], file: null, error: null },
    }));
  }

  function handleClose() {
    setSlots(INITIAL_SLOTS);
    setGlobalError(null);
    setUploading(false);
    onClose();
  }

  async function handleUpload() {
    if (!hasNewFiles) return;
    setUploading(true);
    setGlobalError(null);
    try {
      const uploads = allKeys
        .filter((k) => slots[k].file !== null)
        .map(async (k) => {
          const fd = new FormData();
          fd.append("file", slots[k].file!);
          fd.append("lead_id", leadId ?? "unknown");
          fd.append("doc_type", SLOT_DOC_TYPES[k]);
          const res = await fetch("/api/uploadblobstorage", { method: "POST", body: fd });
          const data = await res.json();
          if (!data.success) throw new Error(`${SLOT_LABELS[k]}: ${data.error ?? "Upload failed"}`);
          return k;
        });

      const uploaded = await Promise.all(uploads);

      setSlots((prev) => {
        const next = { ...prev };
        uploaded.forEach((k) => {
          next[k] = { file: null, previouslyUploaded: true, error: null };
        });
        return next;
      });
    } catch (err: any) {
      setGlobalError(err.message ?? "One or more uploads failed. Please try again.");
    } finally {
      setUploading(false);
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
          "fixed top-0 right-0 z-50 h-full w-full max-w-[540px] bg-white shadow-2xl",
          "flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label="Upload Identification Documents"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-base font-bold text-gray-900 leading-snug">
              Upload Identification Documents
            </h2>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Upload your identification documents to verify your identity for the property transaction.
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Upload Status Banner */}
          <div className={[
            "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold",
            isTaskComplete
              ? "bg-green-50 border-green-200 text-green-700"
              : uploadedCount > 0
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-gray-50 border-gray-200 text-gray-600",
          ].join(" ")}>
            {isTaskComplete ? (
              <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" strokeWidth={2.5} />
            ) : (
              <div className={[
                "flex-shrink-0 w-4 h-4 rounded-full border-2",
                uploadedCount > 0 ? "border-amber-400" : "border-gray-300",
              ].join(" ")} />
            )}
            <span>
              Upload Status: {uploadedCount} of 4 required documents uploaded
              {isTaskComplete ? " – Task Complete!" : ""}
            </span>
          </div>

          {/* Why is Identification Required */}
          <div className="rounded-xl border-l-4 border-[#C10007] bg-[#FEF2F2] px-4 py-4">
            <div className="flex items-start gap-2.5 mb-2">
              <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-[#C10007] flex items-center justify-center">
                <AlertCircle size={12} className="text-white" strokeWidth={2.5} />
              </div>
              <p className="text-sm font-bold text-gray-900">Why is Identification Required?</p>
            </div>
            <div className="ml-7 space-y-1.5 text-xs text-gray-600 leading-relaxed">
              <p>Government-issued identification is required to verify your identity and comply with legal requirements for property transactions.</p>
              <p>This helps prevent fraud and ensures all parties are properly identified before proceeding with the closing.</p>
            </div>
          </div>

          {/* Required Documents */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-3">Required Documents</h3>
            <ul className="space-y-2">
              {[
                { label: "Primary ID:", desc: "Valid passport, citizenship card, or permanent resident card" },
                { label: "Secondary ID:", desc: "Driver's license, provincial photo card, or SIN card (not paper version)" },
                { label: "Important Note:", desc: "Health card is not a valid government ID" },
              ].map((item) => (
                <li key={item.label} className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full bg-[#C10007]" />
                  <p className="text-xs text-gray-600 leading-relaxed">
                    <span className="font-semibold text-gray-800">{item.label}</span>{" "}
                    {item.desc}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Primary ID Upload */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-1">
              Upload Primary Identification (Front and Back)
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Passport, Citizenship Card, or Permanent Resident Card
            </p>
            <div className="grid grid-cols-2 gap-3">
              <UploadSlot
                slotKey="primaryFront"
                label={SLOT_LABELS.primaryFront}
                state={slots.primaryFront}
                onFile={handleFile}
                onClear={handleClear}
                dragOver={dragOverSlot === "primaryFront"}
                onDragOver={() => setDragOverSlot("primaryFront")}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={(k, f) => { setDragOverSlot(null); handleFile(k, f); }}
              />
              <UploadSlot
                slotKey="primaryBack"
                label={SLOT_LABELS.primaryBack}
                state={slots.primaryBack}
                onFile={handleFile}
                onClear={handleClear}
                dragOver={dragOverSlot === "primaryBack"}
                onDragOver={() => setDragOverSlot("primaryBack")}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={(k, f) => { setDragOverSlot(null); handleFile(k, f); }}
              />
            </div>
          </div>

          {/* Secondary ID Upload */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-1">
              Upload Secondary Identification (Required - Front and Back)
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Driver's License, Provincial Photo Card, or SIN Card (not paper version)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <UploadSlot
                slotKey="secondaryFront"
                label={SLOT_LABELS.secondaryFront}
                state={slots.secondaryFront}
                onFile={handleFile}
                onClear={handleClear}
                dragOver={dragOverSlot === "secondaryFront"}
                onDragOver={() => setDragOverSlot("secondaryFront")}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={(k, f) => { setDragOverSlot(null); handleFile(k, f); }}
              />
              <UploadSlot
                slotKey="secondaryBack"
                label={SLOT_LABELS.secondaryBack}
                state={slots.secondaryBack}
                onFile={handleFile}
                onClear={handleClear}
                dragOver={dragOverSlot === "secondaryBack"}
                onDragOver={() => setDragOverSlot("secondaryBack")}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={(k, f) => { setDragOverSlot(null); handleFile(k, f); }}
              />
            </div>
          </div>

          {/* Document Requirements Checklist */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
            <h4 className="text-xs font-bold text-gray-800 mb-3">Document Requirements Checklist</h4>
            <ul className="space-y-2">
              {[
                <><span className="font-semibold">Two pieces of identification are required</span> (Primary and Secondary)</>,
                <>Both front and back of each ID document (if applicable)</>,
                <>Documents are clear and legible</>,
                <>IDs are current and not expired</>,
                <>Names match your personal information</>,
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Global error */}
          {globalError && (
            <div className="flex items-start gap-2 text-xs text-[#C10007] bg-[#FEF2F2] border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle size={13} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
              <span>{globalError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={handleClose}
            disabled={uploading}
            className="sm:flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={!hasNewFiles || uploading}
            loading={uploading}
            onClick={handleUpload}
            className="sm:flex-1"
          >
            Upload Identification Documents
          </Button>
        </div>
      </div>
    </>
  );
}
