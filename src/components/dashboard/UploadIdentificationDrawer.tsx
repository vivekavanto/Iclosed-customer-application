"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import Webcam from "react-webcam";
import { X, Upload, CheckCircle2, AlertCircle, Camera, RotateCcw, Trash2, FileText, Plus, RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";

interface UploadIdentificationDrawerProps {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  taskId?: string;
  onSaved?: () => void;
}

type LabelKey = "primary_front" | "primary_back" | "secondary_front" | "secondary_back" | "other";

interface SelectedFile {
  id: string;
  file: File;
  previewUrl: string | null;
  error: string | null;
  label: LabelKey;
}

interface ExistingDoc {
  id: string;
  file_name: string | null;
  file_url: string | null;
  custom_type: string | null;
  created_at: string | null;
}

const DOC_TYPE = "identification";
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".heic"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const LABEL_OPTIONS: { value: LabelKey; text: string }[] = [
  { value: "primary_front", text: "Primary ID - Front" },
  { value: "primary_back", text: "Primary ID - Back" },
  { value: "secondary_front", text: "Secondary ID - Front" },
  { value: "secondary_back", text: "Secondary ID - Back" },
  { value: "other", text: "Other" },
];

const REQUIRED_LABELS: LabelKey[] = [
  "primary_front",
  "primary_back",
  "secondary_front",
  "secondary_back",
];

const DEFAULT_ORDER: LabelKey[] = [
  "primary_front",
  "primary_back",
  "secondary_front",
  "secondary_back",
];

function labelText(label: LabelKey) {
  return LABEL_OPTIONS.find((o) => o.value === label)?.text ?? "Other";
}

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

function isImageFile(f: File) {
  return f.type.startsWith("image/");
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

export default function UploadIdentificationDrawer({
  open,
  onClose,
  leadId,
  taskId,
  onSaved,
}: UploadIdentificationDrawerProps) {
  const [selected, setSelected] = useState<SelectedFile[]>([]);
  const [existing, setExisting] = useState<ExistingDoc[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Camera state
  const webcamRef = useRef<Webcam | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [currentCapture, setCurrentCapture] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [sharpnessScore, setSharpnessScore] = useState<number | null>(null);
  const [sharpnessOk, setSharpnessOk] = useState(false);
  const [validatingImage, setValidatingImage] = useState(false);

  const resetAll = useCallback(() => {
    selected.forEach((s) => {
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
    });
    setSelected([]);
    setExisting([]);
    setGlobalError(null);
    setUploading(false);
    setDragOver(false);
    setCameraOpen(false);
    setCurrentCapture(null);
    setCameraError(null);
    setSharpnessScore(null);
    setSharpnessOk(false);
    setValidatingImage(false);
  }, [selected]);

  const handleClose = useCallback(() => {
    resetAll();
    onClose();
  }, [onClose, resetAll]);

  // Load existing docs when drawer opens
  useEffect(() => {
    if (!open || !leadId) return;
    let cancelled = false;
    setLoadingExisting(true);
    fetch(`/api/lead-identification-docs?lead_id=${encodeURIComponent(leadId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) setExisting(data.docs ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, leadId]);

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
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      selected.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nextDefaultLabel(currentSelected: SelectedFile[], existingDocs: ExistingDoc[]): LabelKey {
    const used = new Set<string>();
    for (const s of currentSelected) used.add(s.label);
    for (const d of existingDocs) if (d.custom_type) used.add(d.custom_type);
    for (const key of DEFAULT_ORDER) {
      if (!used.has(key)) return key;
    }
    return "other";
  }

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    const errors: string[] = [];

    setSelected((prev) => {
      const nextList = [...prev];
      for (const f of incoming) {
        const err = validateFile(f);
        if (err) {
          errors.push(`${f.name}: ${err}`);
          continue;
        }
        nextList.push({
          id: makeId(),
          file: f,
          previewUrl: isImageFile(f) ? URL.createObjectURL(f) : null,
          error: null,
          label: nextDefaultLabel(nextList, existing),
        });
      }
      return nextList;
    });

    if (errors.length) setGlobalError(errors.join(" • "));
    else setGlobalError(null);
  }

  function removeSelected(id: string) {
    setSelected((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  function setSelectedLabel(id: string, label: LabelKey) {
    setSelected((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));
  }

  async function removeExisting(id: string) {
    const prev = existing;
    setExisting((cur) => cur.filter((d) => d.id !== id));
    try {
      const res = await fetch(`/api/lead-identification-docs?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Failed to delete");
    } catch (err: unknown) {
      setExisting(prev);
      setGlobalError(err instanceof Error ? err.message : "Failed to delete document.");
    }
  }

  function startReplace(id: string) {
    setReplacingId(id);
    setGlobalError(null);
    replaceInputRef.current?.click();
  }

  async function handleReplaceFile(file: File) {
    const id = replacingId;
    if (!id || !leadId) {
      setReplacingId(null);
      return;
    }

    const err = validateFile(file);
    if (err) {
      setGlobalError(`${file.name}: ${err}`);
      setReplacingId(null);
      return;
    }

    setReplacingId(id);
    try {
      const existingDoc = existing.find((d) => d.id === id);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("lead_id", leadId);
      fd.append("doc_type", DOC_TYPE);
      if (existingDoc?.custom_type) fd.append("custom_type", existingDoc.custom_type);
      const uploadRes = await fetch("/api/uploadblobstorage", { method: "POST", body: fd });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) throw new Error(uploadData.error ?? "Upload failed");

      const delRes = await fetch(`/api/lead-identification-docs?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const delData = await delRes.json();
      if (!delData.success) throw new Error(delData.error ?? "Failed to remove old file");

      const r = await fetch(`/api/lead-identification-docs?lead_id=${encodeURIComponent(leadId)}`);
      const d = await r.json();
      if (d.success) setExisting(d.docs ?? []);
    } catch (e: unknown) {
      setGlobalError(e instanceof Error ? e.message : "Failed to replace file.");
    } finally {
      setReplacingId(null);
    }
  }

  // Camera handlers
  function openCamera() {
    setCameraOpen(true);
    setCurrentCapture(null);
    setCameraError(null);
    setSharpnessScore(null);
    setSharpnessOk(false);
    setValidatingImage(false);
  }

  function closeCamera() {
    setCameraOpen(false);
    setCurrentCapture(null);
    setCameraError(null);
    setSharpnessScore(null);
    setSharpnessOk(false);
    setValidatingImage(false);
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

  async function handleUseCapturedImage() {
    if (!currentCapture || !sharpnessOk) {
      setCameraError("Please retake a clearer image before using it.");
      return;
    }
    const file = await dataUrlToFile(currentCapture, `id-capture-${Date.now()}.jpg`);
    addFiles([file]);
    setCurrentCapture(null);
    setSharpnessScore(null);
    setSharpnessOk(false);
    setCameraError(null);
  }

  async function handleUpload() {
    if (selected.length === 0) return;
    if (!leadId) {
      setGlobalError("Missing lead. Please refresh and try again.");
      return;
    }
    if (hasDuplicates) {
      setGlobalError(
        `Duplicate labels detected (${duplicatePendingLabels.map(labelText).join(", ")}). Fix them before uploading.`
      );
      return;
    }
    if (!allRequiredMet) {
      setGlobalError(
        `Missing required document${missingRequired.length > 1 ? "s" : ""}: ${missingRequired.map(labelText).join(", ")}.`
      );
      return;
    }

    setUploading(true);
    setGlobalError(null);

    try {
      const uploads = selected.map(async (s) => {
        const fd = new FormData();
        fd.append("file", s.file);
        fd.append("lead_id", leadId);
        fd.append("doc_type", DOC_TYPE);
        fd.append("custom_type", s.label);
        const res = await fetch("/api/uploadblobstorage", { method: "POST", body: fd });
        const data = await res.json();
        if (!data.success) throw new Error(`${s.file.name}: ${data.error ?? "Upload failed"}`);
      });

      await Promise.all(uploads);

      if (taskId) {
        const respRes = await fetch("/api/task-responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task_id: taskId,
            responses: selected.map((s) => ({
              field_label: labelText(s.label),
              field_type: "file",
              value: s.file.name,
            })),
          }),
        });
        if (!respRes.ok) throw new Error("Files uploaded, but failed to record task completion.");
        if (onSaved) onSaved();
      }

      // Clear selected and reload existing
      selected.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
      setSelected([]);

      try {
        const r = await fetch(`/api/lead-identification-docs?lead_id=${encodeURIComponent(leadId)}`);
        const d = await r.json();
        if (d.success) setExisting(d.docs ?? []);
      } catch {}
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : "One or more uploads failed.");
    } finally {
      setUploading(false);
    }
  }

  const totalCount = selected.length + existing.length;

  // Coverage: which required labels are covered (across existing + pending)
  const coveredLabels = new Set<string>();
  for (const d of existing) if (d.custom_type) coveredLabels.add(d.custom_type);
  for (const s of selected) coveredLabels.add(s.label);
  const missingRequired = REQUIRED_LABELS.filter((r) => !coveredLabels.has(r));

  // Duplicate detection among pending (same label twice)
  const pendingLabelCounts = selected.reduce<Record<string, number>>((acc, s) => {
    acc[s.label] = (acc[s.label] ?? 0) + 1;
    return acc;
  }, {});
  const duplicatePendingLabels = Object.entries(pendingLabelCounts)
    .filter(([k, v]) => v > 1 && k !== "other")
    .map(([k]) => k as LabelKey);

  const allRequiredMet = missingRequired.length === 0;
  const hasDuplicates = duplicatePendingLabels.length > 0;
  // After this upload, coverage must cover all 4 required labels.
  // coveredLabels already includes existing + pending, so allRequiredMet reflects post-upload state.
  const canUpload = selected.length > 0 && !uploading && !hasDuplicates && allRequiredMet;

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
          {/* Status banner */}
          <div
            className={[
              "flex items-start gap-3 px-4 py-3 rounded-xl border text-sm font-semibold",
              allRequiredMet
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-amber-50 border-amber-200 text-amber-800",
            ].join(" ")}
          >
            {allRequiredMet ? (
              <CheckCircle2 size={16} className="text-green-600 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
            ) : (
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
            )}
            <div className="flex-1 min-w-0">
              <div>
                {existing.length > 0 && `${existing.length} previously uploaded`}
                {existing.length > 0 && selected.length > 0 && " • "}
                {selected.length > 0 && `${selected.length} ready to upload`}
                {totalCount === 0 && "No documents added yet"}
              </div>
              {!allRequiredMet && (
                <div className="mt-1 text-[11px] font-medium text-amber-700">
                  Missing: {missingRequired.map(labelText).join(", ")}
                </div>
              )}
            </div>
          </div>

          {/* Why required */}
          <div className="rounded-xl border-l-4 border-[#C10007] bg-[#FEF2F2] px-4 py-4">
            <div className="flex items-start gap-2.5 mb-2">
              <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-[#C10007] flex items-center justify-center">
                <AlertCircle size={12} className="text-white" strokeWidth={2.5} />
              </div>
              <p className="text-sm font-bold text-gray-900">Why is Identification Required?</p>
            </div>
            <div className="ml-7 space-y-1.5 text-xs text-gray-600 leading-relaxed">
              <p>
                Government-issued identification is required to verify your identity and comply with
                legal requirements for property transactions.
              </p>
              <p>
                This helps prevent fraud and ensures all parties are properly identified before
                proceeding with the closing.
              </p>
            </div>
          </div>

          {/* Required Documents list */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-3">Required Documents</h3>
            <ul className="space-y-2">
              {[
                { label: "Primary ID:", desc: "Valid passport, citizenship card, or permanent resident card (front & back)" },
                { label: "Secondary ID:", desc: "Driver's license, provincial photo card, or SIN card (front & back, not paper)" },
                { label: "Note:", desc: "Health card is not a valid government ID" },
              ].map((item) => (
                <li key={item.label} className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full bg-[#C10007]" />
                  <p className="text-xs text-gray-600 leading-relaxed">
                    <span className="font-semibold text-gray-800">{item.label}</span> {item.desc}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Upload zone */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-2">Add Documents</h3>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
              className={[
                "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all select-none",
                dragOver
                  ? "border-[#C10007] bg-[#FEF2F2]"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
              ].join(" ")}
            >
              <div
                className={[
                  "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                  dragOver ? "bg-[#FEF2F2]" : "bg-gray-100",
                ].join(" ")}
              >
                <Upload size={20} className={dragOver ? "text-[#C10007]" : "text-gray-400"} strokeWidth={2} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  Click to select or drag files here
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Select multiple files at once • PDF, JPG, PNG, HEIC • Max 10MB each
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.heic"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="mt-3 rounded-xl border border-[#C10007]/20 bg-[#FEF2F2] px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">Use Camera</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Capture as many ID images as you need.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={openCamera}
                  disabled={uploading}
                  className="sm:w-auto"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Camera size={14} />
                    Open Camera
                  </span>
                </Button>
              </div>
            </div>
          </div>

          {/* Existing uploaded docs */}
          {loadingExisting && (
            <p className="text-xs text-gray-400">Loading previously uploaded documents...</p>
          )}
          {existing.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">
                Previously Uploaded ({existing.length})
              </h3>
              <ul className="space-y-2">
                {existing.map((doc) => {
                  const isReplacing = replacingId === doc.id;
                  return (
                    <li
                      key={doc.id}
                      className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2"
                    >
                      <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" strokeWidth={2.5} />
                      <div className="min-w-0 flex-1">
                        {doc.file_url ? (
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-green-800 hover:underline truncate block"
                          >
                            {doc.file_name ?? "Document"}
                          </a>
                        ) : (
                          <p className="text-xs font-semibold text-green-800 truncate">
                            {doc.file_name ?? "Document"}
                          </p>
                        )}
                        {doc.custom_type && (
                          <p className="text-[10px] font-medium text-green-700 mt-0.5">
                            {labelText(doc.custom_type as LabelKey)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => startReplace(doc.id)}
                        disabled={isReplacing || !!replacingId}
                        className="cursor-pointer flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        aria-label="Replace"
                      >
                        <RefreshCw size={12} className={isReplacing ? "animate-spin" : ""} />
                        {isReplacing ? "Replacing..." : "Replace"}
                      </button>
                      <button
                        onClick={() => removeExisting(doc.id)}
                        disabled={!!replacingId}
                        className="cursor-pointer flex-shrink-0 p-1.5 rounded-md text-gray-500 hover:text-[#C10007] hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        aria-label="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <input
                ref={replaceInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.heic"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleReplaceFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* Selected (pending) files */}
          {selected.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">
                Ready to Upload ({selected.length})
              </h3>
              <ul className="space-y-2">
                {selected.map((s) => {
                  const isDuplicate = duplicatePendingLabels.includes(s.label);
                  return (
                    <li
                      key={s.id}
                      className={[
                        "rounded-lg border bg-white overflow-hidden",
                        isDuplicate ? "border-amber-300 bg-amber-50" : "border-gray-200",
                      ].join(" ")}
                    >
                      {/* Label header chip */}
                      <div
                        className={[
                          "px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide border-b",
                          s.label === "other"
                            ? "bg-gray-100 text-gray-600 border-gray-200"
                            : isDuplicate
                              ? "bg-amber-100 text-amber-800 border-amber-200"
                              : "bg-[#FEF2F2] text-[#C10007] border-[#C10007]/20",
                        ].join(" ")}
                      >
                        {labelText(s.label)}
                      </div>

                      <div className="flex items-center gap-3 px-3 py-2">
                        <div className="w-12 h-12 flex-shrink-0 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
                          {s.previewUrl ? (
                            <NextImage
                              src={s.previewUrl}
                              alt={s.file.name}
                              width={48}
                              height={48}
                              unoptimized
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <FileText size={18} className="text-gray-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-800 truncate">{s.file.name}</p>
                          <p className="text-[11px] text-gray-400 mb-1">{formatBytes(s.file.size)}</p>
                          <select
                            value={s.label}
                            onChange={(e) => setSelectedLabel(s.id, e.target.value as LabelKey)}
                            className={[
                              "w-full text-[11px] font-semibold rounded-md border px-2 py-1 cursor-pointer",
                              isDuplicate
                                ? "border-amber-400 bg-amber-50 text-amber-800"
                                : "border-gray-200 bg-white text-gray-700",
                            ].join(" ")}
                          >
                            {LABEL_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.text}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={() => removeSelected(s.id)}
                          className="cursor-pointer flex-shrink-0 p-1.5 rounded-md text-gray-500 hover:text-[#C10007] hover:bg-red-50"
                          aria-label="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {hasDuplicates && (
                <p className="mt-2 text-[11px] text-amber-700 flex items-center gap-1">
                  <AlertCircle size={11} strokeWidth={2} />
                  Duplicate labels detected ({duplicatePendingLabels.map(labelText).join(", ")}). Change them before uploading.
                </p>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#C10007] hover:underline cursor-pointer"
              >
                <Plus size={12} />
                Add more files
              </button>
            </div>
          )}

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
            disabled={!canUpload}
            loading={uploading}
            onClick={handleUpload}
            className="sm:flex-1"
          >
            {selected.length === 0
              ? "Upload Documents"
              : !allRequiredMet
                ? `Missing ${missingRequired.length} Required Label${missingRequired.length > 1 ? "s" : ""}`
                : hasDuplicates
                  ? "Fix Duplicate Labels"
                  : `Upload ${selected.length} Document${selected.length > 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>

      {/* Camera overlay */}
      {cameraOpen && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/55" onClick={closeCamera} aria-hidden="true" />
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center px-4"
            role="dialog"
            aria-modal="true"
            aria-label="Capture ID with camera"
          >
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-gray-100">
              <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
                <div className="pr-4">
                  <h3 className="text-sm font-bold text-gray-900">Capture ID with Camera</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Capture each side of each ID. Added captures appear in the list below.
                  </p>
                </div>
                <button
                  onClick={closeCamera}
                  className="cursor-pointer rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  aria-label="Close camera"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3">
                {!currentCapture ? (
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
                      <p className="text-[11px] text-gray-500 mt-1">
                        Ensure text is readable and all corners of the ID are visible.
                      </p>
                      {sharpnessScore !== null && (
                        <p
                          className={`text-[11px] mt-2 ${
                            sharpnessOk ? "text-green-600" : "text-amber-600"
                          }`}
                        >
                          {sharpnessOk ? "Clarity check passed" : "Clarity check failed"} (score:{" "}
                          {Math.round(sharpnessScore)})
                        </p>
                      )}
                    </div>
                  </>
                )}

                {cameraError && (
                  <div className="flex items-start gap-2 text-xs text-[#C10007] bg-[#FEF2F2] border border-red-200 rounded-lg px-3 py-2.5">
                    <AlertCircle size={13} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
                    <span>{cameraError}</span>
                  </div>
                )}

                {selected.length > 0 && (
                  <p className="text-[11px] text-gray-500 text-center">
                    Captured so far: {selected.length}
                  </p>
                )}
              </div>

              <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-2">
                {!currentCapture ? (
                  <>
                    <Button variant="secondary" fullWidth onClick={closeCamera} className="sm:flex-1">
                      Done
                    </Button>
                    <Button variant="primary" fullWidth onClick={handleCaptureImage} className="sm:flex-1">
                      <span className="inline-flex items-center gap-1.5">
                        <Camera size={14} />
                        Capture
                      </span>
                    </Button>
                  </>
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
                      onClick={handleUseCapturedImage}
                      className="sm:flex-1"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Plus size={14} />
                        Add & Capture More
                      </span>
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
