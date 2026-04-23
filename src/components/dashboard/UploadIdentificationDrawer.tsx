"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import Webcam from "react-webcam";
import {
  X,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Camera,
  RotateCcw,
  ArrowRight,
  ChevronDown,
  FileText,
  Trash2,
  Plus,
  Loader2,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import Button from "@/components/ui/Button";

interface UploadIdentificationDrawerProps {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  taskId?: string;
  onSaved?: () => void;
}

// ── Camera slot model (used only by the guided camera flow) ───────────────────

type SlotKey = "primaryFront" | "primaryBack" | "secondaryFront" | "secondaryBack";

const SLOT_LABELS: Record<SlotKey, string> = {
  primaryFront: "First ID - Front",
  primaryBack: "First ID - Back",
  secondaryFront: "Second ID - Front",
  secondaryBack: "Second ID - Back",
};

const SLOT_CUSTOM_TYPES: Record<SlotKey, LabelKey> = {
  primaryFront: "primary_front",
  primaryBack: "primary_back",
  secondaryFront: "secondary_front",
  secondaryBack: "secondary_back",
};

const CAMERA_STEPS: SlotKey[] = ["primaryFront", "primaryBack", "secondaryFront", "secondaryBack"];

// ── Manual upload model (list of selected files with labels) ─────────────────

type LabelKey = "primary_front" | "primary_back" | "secondary_front" | "secondary_back" | "other";

interface DetectionResult {
  isIdentification: boolean;
  documentType: string | null;
  side: "front" | "back" | "unknown";
  sideRequirement: "single-sided" | "front-and-back" | "unknown";
  confidence: "high" | "medium" | "low";
  reason: string;
}

interface SelectedFile {
  id: string;
  file: File;
  previewUrl: string | null;
  error: string | null;
  label: LabelKey;
  detecting: boolean;
  detection: DetectionResult | null;
  detectionError: string | null;
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

function siblingSideLabel(label: LabelKey): LabelKey | null {
  if (label === "primary_front") return "primary_back";
  if (label === "primary_back") return "primary_front";
  if (label === "secondary_front") return "secondary_back";
  if (label === "secondary_back") return "secondary_front";
  return null;
}

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

type DetectionFetchResult =
  | { ok: true; detection: DetectionResult }
  | { ok: false; error: string };

async function fetchDetection(file: File, timeoutMs = 30_000): Promise<DetectionFetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/identify-document", {
      method: "POST",
      body: fd,
      signal: controller.signal,
    });
    const data = await res
      .json()
      .catch(() => ({ success: false, error: "Invalid response from server." }));
    if (!data.success) {
      return { ok: false, error: data.error ?? "Detection failed." };
    }
    const r = data.result as {
      is_identification: boolean;
      document_type: string | null;
      side: "front" | "back" | "unknown";
      side_requirement: "single-sided" | "front-and-back" | "unknown";
      confidence: "high" | "medium" | "low";
      reason: string;
    };
    return {
      ok: true,
      detection: {
        isIdentification: r.is_identification,
        documentType: r.document_type,
        side: r.side,
        sideRequirement: r.side_requirement ?? "unknown",
        confidence: r.confidence,
        reason: r.reason,
      },
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Detection timed out."
        : err instanceof Error
          ? err.message
          : "Detection failed.";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

function appendDetectionFields(fd: FormData, det: DetectionResult | null) {
  if (!det) return;
  fd.append("is_identification", det.isIdentification ? "true" : "false");
  if (det.documentType) fd.append("document_type", det.documentType);
  fd.append("side", det.side);
  fd.append("side_requirement", det.sideRequirement);
  fd.append("confidence", det.confidence);
  if (det.reason) fd.append("detection_reason", det.reason);
}

// ── Acceptable Documents Dropdown (LSO By-Law 7.1) ────────────────────────────

function AcceptableDocumentsDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  const acceptableDocs = [
    "Canadian Passport",
    "Driver's License",
    "Canadian Citizenship Card",
    "Permanent Resident Card",
    "NEXUS Card",
    "SIN Card (plastic only)",
    "Foreign Passport",
    "Government-issued Photo ID Card",
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
            As per Law Society of Ontario By-Law 7.1, please provide{" "}
            <span className="font-semibold text-gray-700">two different government-issued photo IDs</span>{" "}
            from the list below for identity verification.
          </p>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {acceptableDocs.map((doc) => (
              <div key={doc} className="flex items-center gap-2 text-xs text-gray-600">
                <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                <span>{doc}</span>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 pt-3 border-t border-gray-100">
            <AlertCircle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-gray-500">
              <span className="font-semibold text-gray-700">Note:</span> Health cards are not valid
              government ID for these purposes.
            </p>
          </div>
        </div>
      )}
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
  // Manual upload state
  const [selected, setSelected] = useState<SelectedFile[]>([]);
  const [existing, setExisting] = useState<ExistingDoc[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<SelectedFile[]>([]);

  // Keep selectedRef in sync so detection callbacks can read the current file name
  // without being inside a setState updater
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Detection failure modal
  const [detectionFailModal, setDetectionFailModal] = useState<{
    open: boolean;
    fileId: string;
    fileName: string;
  }>({ open: false, fileId: "", fileName: "" });

  // Camera flow state (guided 4-step capture)
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

  const resetAll = useCallback(() => {
    selected.forEach((s) => {
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
    });
    setSelected([]);
    setExisting([]);
    setGlobalError(null);
    setUploading(false);
    setDragOver(false);
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

  // ── Manual upload handlers ──────────────────────────────────────────────────

  function nextDefaultLabel(currentSelected: SelectedFile[], existingDocs: ExistingDoc[]): LabelKey {
    const used = new Set<string>();
    for (const s of currentSelected) used.add(s.label);
    for (const d of existingDocs) if (d.custom_type) used.add(d.custom_type);
    for (const key of DEFAULT_ORDER) {
      if (!used.has(key)) return key;
    }
    return "other";
  }

  async function detectIdentification(id: string, file: File) {
    const result = await fetchDetection(file);
    const fileName = selectedRef.current.find((s) => s.id === id)?.file.name ?? "";

    if (!result.ok) {
      setSelected((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, detecting: false, detection: null, detectionError: result.error }
            : s,
        ),
      );
      setDetectionFailModal({ open: true, fileId: id, fileName });
      return;
    }

    setSelected((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, detecting: false, detection: result.detection, detectionError: null }
          : s,
      ),
    );
    if (!result.detection.isIdentification) {
      setDetectionFailModal({ open: true, fileId: id, fileName });
    }
  }

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    const errors: string[] = [];
    const queuedForDetection: { id: string; file: File }[] = [];
    const additions: SelectedFile[] = [];
    const working = [...selected];

    for (const f of incoming) {
      const err = validateFile(f);
      if (err) {
        errors.push(`${f.name}: ${err}`);
        continue;
      }
      const id = makeId();
      const nextItem: SelectedFile = {
        id,
        file: f,
        previewUrl: isImageFile(f) ? URL.createObjectURL(f) : null,
        error: null,
        label: nextDefaultLabel(working, existing),
        detecting: true,
        detection: null,
        detectionError: null,
      };
      additions.push(nextItem);
      working.push(nextItem);
      queuedForDetection.push({ id, file: f });
    }

    if (additions.length > 0) {
      setSelected((prev) => [...prev, ...additions]);
    }

    if (errors.length) setGlobalError(errors.join(" • "));
    else setGlobalError(null);

    // Kick off Gemini detection for each newly added file (fire-and-forget).
    queuedForDetection.forEach(({ id, file }) => {
      void detectIdentification(id, file);
    });
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

  // ── Camera flow handlers ────────────────────────────────────────────────────

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

  async function uploadCameraFilesBySlot(filesBySlot: Partial<Record<SlotKey, File>>) {
    const uploadKeys = CAMERA_STEPS.filter((k) => filesBySlot[k]);
    if (!uploadKeys.length) return;

    // Run Gemini detection on each captured image so camera uploads carry the
    // same metadata as manual uploads. Detection failures are non-blocking —
    // the file still uploads with NULL detection columns.
    const detectionEntries = await Promise.all(
      uploadKeys.map(async (k) => {
        const file = filesBySlot[k] as File;
        const r = await fetchDetection(file);
        return [k, r.ok ? r.detection : null] as const;
      }),
    );
    const detectionBySlot = new Map<SlotKey, DetectionResult | null>(detectionEntries);

    const uploads = uploadKeys.map(async (k) => {
      const file = filesBySlot[k] as File;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("lead_id", leadId ?? "unknown");
      // Keep camera uploads aligned with manual uploads to satisfy DB constraints.
      fd.append("doc_type", DOC_TYPE);
      fd.append("custom_type", SLOT_CUSTOM_TYPES[k]);
      appendDetectionFields(fd, detectionBySlot.get(k) ?? null);
      const res = await fetch("/api/uploadblobstorage", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(`${SLOT_LABELS[k]}: ${data.error ?? "Upload failed"}`);
      const url: string | undefined = data.url ?? data.file_url;
      if (!url) throw new Error(`${SLOT_LABELS[k]}: upload did not return a URL.`);
      return { slot: k, file, url };
    });

    const uploaded = await Promise.all(uploads);

    if (taskId) {
      const respRes = await fetch("/api/task-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          responses: uploaded.map(({ slot, file, url }) => ({
            field_label: SLOT_LABELS[slot],
            field_type: "file",
            file_url: url,
            file_name: file.name,
          })),
        }),
      });

      if (!respRes.ok) throw new Error("Files uploaded, but failed to record task completion.");
      if (onSaved) onSaved();
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
      await uploadCameraFilesBySlot(cameraCapturedFiles);

      if (leadId) {
        try {
          const r = await fetch(
            `/api/lead-identification-docs?lead_id=${encodeURIComponent(leadId)}`,
          );
          const d = await r.json();
          if (d.success) setExisting(d.docs ?? []);
        } catch {}
      }

      closeCameraFlow();
    } catch (err: unknown) {
      setCameraError(err instanceof Error ? err.message : "Unable to submit camera captures.");
    } finally {
      setCameraSubmitting(false);
    }
  }

  // ── Manual upload submit ────────────────────────────────────────────────────

  async function handleUpload() {
    if (selected.length === 0) return;
    if (!leadId) {
      setGlobalError("Missing lead. Please refresh and try again.");
      return;
    }
    if (hasDuplicates) {
      setGlobalError(
        `Duplicate labels detected (${duplicatePendingLabels.map(labelText).join(", ")}). Fix them before uploading.`,
      );
      return;
    }
    if (!allRequiredMet) {
      setGlobalError(
        `Missing required document${missingRequired.length > 1 ? "s" : ""}: ${missingRequired.map(labelText).join(", ")}.`,
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
        appendDetectionFields(fd, s.detection);
        const res = await fetch("/api/uploadblobstorage", { method: "POST", body: fd });
        const data = await res.json();
        if (!data.success) throw new Error(`${s.file.name}: ${data.error ?? "Upload failed"}`);
        const url: string | undefined = data.url ?? data.file_url;
        if (!url) throw new Error(`${s.file.name}: upload did not return a URL.`);
        return { selected: s, url };
      });

      const uploaded = await Promise.all(uploads);

      if (taskId) {
        const respRes = await fetch("/api/task-responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task_id: taskId,
            responses: uploaded.map(({ selected: s, url }) => ({
              field_label: labelText(s.label),
              field_type: "file",
              file_url: url,
              file_name: s.file.name,
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

  // ── Derived state ───────────────────────────────────────────────────────────

  const totalCount = selected.length + existing.length;

  // Coverage: which required labels are covered (across existing + pending)
  const coveredLabels = new Set<string>();
  for (const d of existing) if (d.custom_type) coveredLabels.add(d.custom_type);
  for (const s of selected) {
    coveredLabels.add(s.label);
    // Edge case: some IDs (for example passports) are valid as single-sided uploads.
    // When Gemini classifies a doc as single-sided, treat the paired side as covered too.
    if (s.detection?.isIdentification && s.detection.sideRequirement === "single-sided") {
      const paired = siblingSideLabel(s.label);
      if (paired) coveredLabels.add(paired);
    }
  }
  const missingRequired = REQUIRED_LABELS.filter((r) => !coveredLabels.has(r));

  // Duplicate detection among pending (same label twice, except "other")
  const pendingLabelCounts = selected.reduce<Record<string, number>>((acc, s) => {
    acc[s.label] = (acc[s.label] ?? 0) + 1;
    return acc;
  }, {});
  const duplicatePendingLabels = Object.entries(pendingLabelCounts)
    .filter(([k, v]) => v > 1 && k !== "other")
    .map(([k]) => k as LabelKey);

  const allRequiredMet = missingRequired.length === 0;
  const hasDuplicates = duplicatePendingLabels.length > 0;
  const hasDetectionFailures = selected.some(
    (s) => s.detectionError !== null || (s.detection !== null && !s.detection.isIdentification),
  );
  const canUpload =
    selected.length > 0 && !uploading && !hasDuplicates && allRequiredMet && !hasDetectionFailures;

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
              <Button variant="primary" onClick={openCameraFlow} disabled={uploading} className="mt-1">
                <span className="inline-flex items-center gap-1.5">
                  <Camera size={14} />
                  Use Camera
                </span>
              </Button>
            </div>
          </div>

          {/* Manual Upload zone */}
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
                          <p className="text-[11px] text-gray-400">{formatBytes(s.file.size)}</p>
                          {s.detecting ? (
                            <p className="mt-1 mb-1 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500">
                              <Loader2 size={11} className="animate-spin" />
                              Identifying document...
                            </p>
                          ) : s.detectionError ? (
                            <p className="mt-1 mb-1 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500">
                              <AlertCircle size={11} />
                              Could not identify document
                            </p>
                          ) : s.detection ? (
                            s.detection.isIdentification && s.detection.documentType ? (
                              <p className="mt-1 mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-green-700">
                                <ShieldCheck size={12} className="flex-shrink-0" />
                                <span className="truncate">
                                  Detected: {s.detection.documentType}
                                  {s.detection.side !== "unknown" ? ` (${s.detection.side})` : ""}
                                </span>
                              </p>
                            ) : (
                              <p className="mt-1 mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                                <ShieldAlert size={12} className="flex-shrink-0" />
                                <span className="truncate">
                                  Not a recognized government ID
                                  {s.detection.reason ? ` — ${s.detection.reason}` : ""}
                                </span>
                              </p>
                            )
                          ) : null}
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

      {/* Detection failure modal */}
      {detectionFailModal.open && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/40"
            aria-hidden="true"
          />
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center px-5"
            role="dialog"
            aria-modal="true"
            aria-label="File upload error"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
              {/* Icon band */}
              <div className="flex justify-center pt-8 pb-4">
                <div className="w-14 h-14 rounded-full bg-[#FEF2F2] flex items-center justify-center">
                  <AlertCircle size={28} className="text-[#C10007]" strokeWidth={1.75} />
                </div>
              </div>

              {/* Text */}
              <div className="px-6 pb-6 text-center space-y-2">
                <h3 className="text-base font-bold text-gray-900">
                  We weren&apos;t able to process this file
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Something went wrong while verifying{" "}
                  <span className="font-semibold text-gray-700 break-all">
                    {detectionFailModal.fileName}
                  </span>
                  . Please remove the current file and attempt to upload it again. If the issue persists, consider using an alternative photo or scan, as this often resolves the problem.
                </p>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 flex flex-col gap-2.5">
                <Button
                  variant="primary"
                  fullWidth
                  onClick={() => {
                    removeSelected(detectionFailModal.fileId);
                    setDetectionFailModal({ open: false, fileId: "", fileName: "" });
                  }}
                >
                  Remove &amp; Try Again
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => setDetectionFailModal({ open: false, fileId: "", fileName: "" })}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Camera flow overlay (guided 4-step) */}
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
                      Step {cameraStepIndex + 1} of {CAMERA_STEPS.length}:{" "}
                      {SLOT_LABELS[currentCameraSlot as SlotKey]}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">
                      Review all captured images, then click Finish.
                    </p>
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
                        <p className="text-xs font-semibold text-gray-700">
                          Review {SLOT_LABELS[currentCameraSlot as SlotKey]}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          Ensure text is readable and all corners of the ID are visible.
                        </p>
                        {sharpnessScore !== null && (
                          <p
                            className={`text-[11px] mt-2 ${sharpnessOk ? "text-green-600" : "text-amber-600"}`}
                          >
                            {sharpnessOk ? "Clarity check passed" : "Clarity check failed"} (score:{" "}
                            {Math.round(sharpnessScore)})
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
                          {cameraStepIndex < CAMERA_STEPS.length - 1
                            ? "Use & Next Step"
                            : "Use & Review All"}
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
