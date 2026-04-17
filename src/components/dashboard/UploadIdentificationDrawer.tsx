"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import Webcam from "react-webcam";
import { X, Upload, CheckCircle2, AlertCircle, RefreshCw, Camera, RotateCcw, ArrowRight, ChevronDown, FileText } from "lucide-react";
import Button from "@/components/ui/Button";

interface UploadIdentificationDrawerProps {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  taskId?: string;
  onSaved?: () => void;
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
const CAMERA_STEPS: SlotKey[] = ["primaryFront", "primaryBack", "secondaryFront", "secondaryBack"];

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

async function computeImageSharpnessScore(dataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const size = 360;
      const srcSide = Math.min(img.width, img.height);
      const sx = (img.width - srcSide) / 2;
      const sy = (img.height - srcSide) / 2;

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Unable to process image."));
        return;
      }

      ctx.drawImage(img, sx, sy, srcSide, srcSide, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      let sum = 0;
      let sumSq = 0;
      let count = 0;

      for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
          const i = (y * size + x) * 4;
          const right = (y * size + (x + 1)) * 4;
          const down = ((y + 1) * size + x) * 4;

          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const grayR = 0.299 * data[right] + 0.587 * data[right + 1] + 0.114 * data[right + 2];
          const grayD = 0.299 * data[down] + 0.587 * data[down + 1] + 0.114 * data[down + 2];

          const gx = gray - grayR;
          const gy = gray - grayD;
          const magnitude = gx * gx + gy * gy;
          sum += magnitude;
          sumSq += magnitude * magnitude;
          count++;
        }
      }

      if (!count) {
        resolve(0);
        return;
      }

      const mean = sum / count;
      const variance = Math.max(0, sumSq / count - mean * mean);
      resolve(variance);
    };
    img.onerror = () => reject(new Error("Unable to read captured image."));
    img.src = dataUrl;
  });
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const blob = await fetch(dataUrl).then((r) => r.blob());
  return new File([blob], filename, { type: "image/jpeg" });
}

// ── Acceptable Documents Dropdown (LSO By-Law 7.1) ────────────────────────────

function AcceptableDocumentsDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  const primaryDocs = [
    "Canadian Passport",
    "Canadian Citizenship Card",
    "Permanent Resident Card",
    "NEXUS Card",
    "Secure Indian Status Card (INAC)",
  ];

  const secondaryDocs = [
    "Driver's License (Canadian province/territory)",
    "Provincial/Territorial Photo ID Card",
    "Canadian Forces ID Card",
    "SIN Card (plastic, not paper version)",
    "Foreign Passport (with valid visa if applicable)",
  ];

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <span className="text-sm font-semibold text-gray-900">
          Acceptable Identification Documents
        </span>
        <ChevronDown
          size={18}
          className={`text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="px-4 py-4 bg-white border-t border-gray-100 space-y-4">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            As per Law Society of Ontario By-Law 7.1, the following government-issued photo identification documents are acceptable for ID verification in property transactions.
          </p>
          
          <div>
            <p className="text-xs font-bold text-gray-800 mb-2">Primary ID (one required)</p>
            <ul className="space-y-1.5">
              {primaryDocs.map((doc) => (
                <li key={doc} className="flex items-center gap-2 text-xs text-gray-600">
                  <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                  {doc}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-800 mb-2">Secondary ID (one required)</p>
            <ul className="space-y-1.5">
              {secondaryDocs.map((doc) => (
                <li key={doc} className="flex items-center gap-2 text-xs text-gray-600">
                  <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                  {doc}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-2 pt-2 border-t border-gray-100">
            <AlertCircle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-gray-500">
              <span className="font-semibold text-gray-700">Note:</span> Health cards are not valid government ID for these purposes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Manual Upload Section ─────────────────────────────────────────────────────

function ManualUploadSection({
  slots,
  dragOverSlot,
  setDragOverSlot,
  handleFile,
  handleClear,
  uploading,
}: {
  slots: Record<SlotKey, SlotState>;
  dragOverSlot: SlotKey | null;
  setDragOverSlot: (key: SlotKey | null) => void;
  handleFile: (key: SlotKey, file: File) => void;
  handleClear: (key: SlotKey) => void;
  uploading: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRefs = {
    primaryFront: useRef<HTMLInputElement>(null),
    primaryBack: useRef<HTMLInputElement>(null),
    secondaryFront: useRef<HTMLInputElement>(null),
    secondaryBack: useRef<HTMLInputElement>(null),
  };

  const hasAnyFile = Object.values(slots).some((s) => s.file || s.previouslyUploaded);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <FileText size={18} className="text-gray-500" strokeWidth={1.5} />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-900">Upload Files Manually</p>
            <p className="text-xs text-gray-500">Already have files saved? Upload them here.</p>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={`text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="px-4 py-4 bg-gray-50 border-t border-gray-100 space-y-4">
          {/* Primary ID */}
          <div>
            <p className="text-xs font-bold text-gray-800 mb-2">Primary ID (Front & Back)</p>
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

          {/* Secondary ID */}
          <div>
            <p className="text-xs font-bold text-gray-800 mb-2">Secondary ID (Front & Back)</p>
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
        </div>
      )}
    </div>
  );
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
  taskId,
  onSaved,
}: UploadIdentificationDrawerProps) {
  const [slots, setSlots] = useState<Record<SlotKey, SlotState>>(INITIAL_SLOTS);
  const [dragOverSlot, setDragOverSlot] = useState<SlotKey | null>(null);
  const [uploading, setUploading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const webcamRef = useRef<Webcam | null>(null);
  const [cameraFlowOpen, setCameraFlowOpen] = useState(false);
  const [cameraStepIndex, setCameraStepIndex] = useState(0);
  const [cameraCapturedFiles, setCameraCapturedFiles] = useState<Partial<Record<SlotKey, File>>>({});
  const [cameraCapturedPreview, setCameraCapturedPreview] = useState<Partial<Record<SlotKey, string>>>({});
  const [currentCapture, setCurrentCapture] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [sharpnessScore, setSharpnessScore] = useState<number | null>(null);
  const [sharpnessOk, setSharpnessOk] = useState(false);
  const [validatingImage, setValidatingImage] = useState(false);
  const [cameraSubmitting, setCameraSubmitting] = useState(false);

  const handleClose = useCallback(() => {
    setSlots(INITIAL_SLOTS);
    setGlobalError(null);
    setUploading(false);
    setCameraFlowOpen(false);
    setCameraStepIndex(0);
    setCameraCapturedFiles({});
    setCameraCapturedPreview({});
    setCurrentCapture(null);
    setCameraError(null);
    setSharpnessScore(null);
    setSharpnessOk(false);
    setValidatingImage(false);
    setCameraSubmitting(false);
    onClose();
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) handleClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, handleClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const allKeys: SlotKey[] = ["primaryFront", "primaryBack", "secondaryFront", "secondaryBack"];
  const hasNewFiles = allKeys.some((k) => slots[k].file !== null);

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

  const currentCameraSlot = CAMERA_STEPS[cameraStepIndex] ?? null;
  const cameraCapturedCount = Object.keys(cameraCapturedFiles).length;
  const cameraFlowReadyToSubmit = CAMERA_STEPS.every((k) => !!cameraCapturedFiles[k]);

  function openCameraFlow() {
    setCameraFlowOpen(true);
    setCameraStepIndex(0);
    setCameraCapturedFiles({});
    setCameraCapturedPreview({});
    setCurrentCapture(null);
    setCameraError(null);
    setSharpnessScore(null);
    setSharpnessOk(false);
    setValidatingImage(false);
    setCameraSubmitting(false);
  }

  function closeCameraFlow() {
    setCameraFlowOpen(false);
    setCameraStepIndex(0);
    setCameraCapturedFiles({});
    setCameraCapturedPreview({});
    setCurrentCapture(null);
    setCameraError(null);
    setSharpnessScore(null);
    setSharpnessOk(false);
    setValidatingImage(false);
    setCameraSubmitting(false);
  }

  async function handleCaptureImage() {
    const img = webcamRef.current?.getScreenshot();
    if (!img) {
      setCameraError("Could not capture image. Please allow camera access and try again.");
      return;
    }

    setCurrentCapture(img);
    setCameraError(null);
    setValidatingImage(true);

    try {
      const score = await computeImageSharpnessScore(img);
      const isSharp = score >= 2200;
      setSharpnessScore(score);
      setSharpnessOk(isSharp);
      if (!isSharp) {
        setCameraError("Image appears blurry. Please hold steady, improve lighting, and retake.");
      }
    } catch (err: unknown) {
      setCameraError(err instanceof Error ? err.message : "Unable to validate image quality.");
      setSharpnessScore(null);
      setSharpnessOk(false);
    } finally {
      setValidatingImage(false);
    }
  }

  async function handleUseCapturedImageForStep() {
    if (!currentCameraSlot || !currentCapture) return;
    if (!sharpnessOk) {
      setCameraError("Please retake a clearer image before using it.");
      return;
    }

    const file = await dataUrlToFile(currentCapture, `${currentCameraSlot}-${Date.now()}.jpg`);
    setCameraCapturedFiles((prev) => ({ ...prev, [currentCameraSlot]: file }));
    setCameraCapturedPreview((prev) => ({ ...prev, [currentCameraSlot]: currentCapture }));

    if (cameraStepIndex < CAMERA_STEPS.length - 1) {
      setCameraStepIndex((prev) => prev + 1);
      setCurrentCapture(null);
      setCameraError(null);
      setSharpnessScore(null);
      setSharpnessOk(false);
      setValidatingImage(false);
      return;
    }

    setCameraStepIndex(CAMERA_STEPS.length);
    setCurrentCapture(null);
    setCameraError(null);
    setSharpnessScore(null);
    setSharpnessOk(false);
    setValidatingImage(false);
  }

  function openCameraStep(stepKey: SlotKey) {
    const nextIndex = CAMERA_STEPS.indexOf(stepKey);
    if (nextIndex < 0) return;
    setCameraStepIndex(nextIndex);
    setCurrentCapture(null);
    setCameraError(null);
    setSharpnessScore(null);
    setSharpnessOk(false);
    setValidatingImage(false);
  }

  async function uploadFilesBySlot(filesBySlot: Partial<Record<SlotKey, File>>) {
    const uploadKeys = allKeys.filter((k) => filesBySlot[k]);
    if (!uploadKeys.length) return;

    const uploads = uploadKeys.map(async (k) => {
      const fd = new FormData();
      fd.append("file", filesBySlot[k] as File);
      fd.append("lead_id", leadId ?? "unknown");
      fd.append("doc_type", SLOT_DOC_TYPES[k]);
      const res = await fetch("/api/uploadblobstorage", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(`${SLOT_LABELS[k]}: ${data.error ?? "Upload failed"}`);
      return k;
    });

    const uploaded = await Promise.all(uploads);

    if (taskId) {
      const respRes = await fetch("/api/task-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          responses: allKeys.filter((k) => filesBySlot[k] || slots[k].previouslyUploaded).map((k) => ({
            field_label: SLOT_LABELS[k],
            field_type: "file",
            value: filesBySlot[k]?.name || "ID Document"
          }))
        })
      });

      if (!respRes.ok) throw new Error("Files uploaded, but failed to record task completion.");
      if (onSaved) onSaved();
    }

    setSlots((prev) => {
      const next = { ...prev };
      uploaded.forEach((k) => {
        next[k] = { file: null, previouslyUploaded: true, error: null };
      });
      return next;
    });
  }

  async function handleUpload() {
    if (!hasNewFiles) return;
    setUploading(true);
    setGlobalError(null);
    try {
      const filesBySlot: Partial<Record<SlotKey, File>> = {};
      allKeys.forEach((k) => {
        if (slots[k].file) filesBySlot[k] = slots[k].file;
      });
      await uploadFilesBySlot(filesBySlot);
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : "One or more uploads failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleFinishCameraFlow() {
    if (!cameraFlowReadyToSubmit) {
      setCameraError("Please capture front and back for both IDs before finishing.");
      return;
    }

    setCameraSubmitting(true);
    setGlobalError(null);

    try {
      await uploadFilesBySlot(cameraCapturedFiles);
      closeCameraFlow();
    } catch (err: unknown) {
      setCameraError(err instanceof Error ? err.message : "Unable to submit camera captures.");
    } finally {
      setCameraSubmitting(false);
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

          {/* Acceptable Documents Dropdown */}
          <AcceptableDocumentsDropdown />

          {/* Take Photos with Camera Option */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center">
                <Camera size={22} className="text-[#C10007]" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Take Photos with Your Camera</p>
                <p className="text-xs text-gray-500 mt-1">
                  Capture front and back of both IDs step by step — no need to save files first.
                </p>
              </div>
              <Button
                variant="primary"
                onClick={openCameraFlow}
                disabled={uploading}
                className="mt-1"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Camera size={14} />
                  Use Camera
                </span>
              </Button>
            </div>
          </div>

          {/* Manual Upload Option */}
          <ManualUploadSection
            slots={slots}
            dragOverSlot={dragOverSlot}
            setDragOverSlot={setDragOverSlot}
            handleFile={handleFile}
            handleClear={handleClear}
            uploading={uploading}
          />

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

      {cameraFlowOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/55"
            onClick={closeCameraFlow}
            aria-hidden="true"
          />
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center px-4"
            role="dialog"
            aria-modal="true"
            aria-label="Capture ID with camera"
          >
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-gray-100">
              <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-gray-900">Use Camera - Guided Capture</h3>
                  {cameraStepIndex < CAMERA_STEPS.length ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Step {cameraStepIndex + 1} of {CAMERA_STEPS.length}: {SLOT_LABELS[currentCameraSlot as SlotKey]}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">Review all captured images, then click Finish.</p>
                  )}
                </div>
                <button
                  onClick={closeCameraFlow}
                  className="cursor-pointer rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  aria-label="Close camera"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3">
                {cameraStepIndex < CAMERA_STEPS.length ? (
                  !currentCapture ? (
                    <>
                      <div className="relative mx-auto w-full max-w-sm aspect-square overflow-hidden rounded-xl bg-gray-950">
                        <Webcam
                          ref={webcamRef}
                          audio={false}
                          screenshotFormat="image/jpeg"
                          screenshotQuality={0.95}
                          videoConstraints={{ facingMode: "environment" }}
                          onUserMediaError={() =>
                            setCameraError("Unable to access camera. Please allow camera permissions.")
                          }
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-dashed border-white/85" />
                        <div className="pointer-events-none absolute inset-0 ring-1 ring-black/10" />
                      </div>
                      <p className="text-[11px] text-gray-500 text-center">
                        Center the full ID in the square, avoid glare, and hold still before capture.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="relative mx-auto w-full max-w-sm aspect-square overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                        <NextImage
                          src={currentCapture}
                          alt="Captured ID preview"
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-semibold text-gray-700">Review {SLOT_LABELS[currentCameraSlot as SlotKey]}</p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          Ensure text is readable and all corners of the ID are visible.
                        </p>
                        {sharpnessScore !== null && (
                          <p className={`text-[11px] mt-2 ${sharpnessOk ? "text-green-600" : "text-amber-600"}`}>
                            {sharpnessOk ? "Clarity check passed" : "Clarity check failed"} (score: {Math.round(sharpnessScore)})
                          </p>
                        )}
                      </div>
                    </>
                  )
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {CAMERA_STEPS.map((key) => (
                        <div key={key} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <p className="text-xs font-semibold text-gray-700 mb-2">{SLOT_LABELS[key]}</p>
                          {cameraCapturedPreview[key] ? (
                            <div className="relative aspect-square overflow-hidden rounded-lg border border-gray-200">
                              <NextImage
                                src={cameraCapturedPreview[key] as string}
                                alt={`${SLOT_LABELS[key]} preview`}
                                fill
                                unoptimized
                                className="object-cover"
                              />
                            </div>
                          ) : (
                            <div className="aspect-square rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center text-xs text-gray-400">
                              Not captured
                            </div>
                          )}
                          <button
                            onClick={() => openCameraStep(key)}
                            className="mt-2 cursor-pointer text-xs font-semibold text-[#C10007] hover:underline"
                          >
                            Retake
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                      Captured {cameraCapturedCount} of {CAMERA_STEPS.length} required photos.
                    </div>
                  </div>
                )}

                {cameraError && (
                  <div className="flex items-start gap-2 text-xs text-[#C10007] bg-[#FEF2F2] border border-red-200 rounded-lg px-3 py-2.5">
                    <AlertCircle size={13} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
                    <span>{cameraError}</span>
                  </div>
                )}
              </div>

              <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-2">
                {cameraStepIndex < CAMERA_STEPS.length ? (
                  !currentCapture ? (
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={handleCaptureImage}
                      className="sm:flex-1"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Camera size={14} />
                        Capture {SLOT_LABELS[currentCameraSlot as SlotKey]}
                      </span>
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        fullWidth
                        onClick={() => {
                          setCurrentCapture(null);
                          setCameraError(null);
                          setSharpnessScore(null);
                          setSharpnessOk(false);
                        }}
                        className="sm:flex-1"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <RotateCcw size={14} />
                          Retake
                        </span>
                      </Button>
                      <Button
                        variant="primary"
                        fullWidth
                        disabled={!sharpnessOk || validatingImage}
                        onClick={handleUseCapturedImageForStep}
                        className="sm:flex-1"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {cameraStepIndex < CAMERA_STEPS.length - 1 ? "Use & Next Step" : "Use & Review All"}
                          <ArrowRight size={14} />
                        </span>
                      </Button>
                    </>
                  )
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => openCameraStep(CAMERA_STEPS[0])}
                      className="sm:flex-1"
                    >
                      Capture Again
                    </Button>
                    <Button
                      variant="primary"
                      fullWidth
                      loading={cameraSubmitting}
                      disabled={!cameraFlowReadyToSubmit || cameraSubmitting}
                      onClick={handleFinishCameraFlow}
                      className="sm:flex-1"
                    >
                      Finish & Submit to Backend
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
