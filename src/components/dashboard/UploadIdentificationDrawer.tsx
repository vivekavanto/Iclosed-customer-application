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
  Clock,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import Button from "@/components/ui/Button";
import { useIsLargeScreen } from "@/hooks/useMediaQuery";
import { docDownloadHref, BLOB_ACCESS } from "@/lib/blobPrivacy";

// Read-only completion status of one party on a multi-party identification task.
export interface PartyStatus {
  lead_id: string;
  first_name: string;
  last_name: string;
  name?: string;
  completed: boolean;
  doc_count?: number;
  doc_total?: number;
}

interface UploadIdentificationDrawerProps {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  taskId?: string;
  // Per-party completion status shown at the top of the drawer (read-only).
  // Replaces the old "Uploading identification for …" picker: the party is now
  // chosen from the dashboard accordion's per-person Upload button, so the drawer
  // just reports who has / hasn't completed. Absent or <2 parties → nothing shown.
  partyStatuses?: PartyStatus[];
  onSaved?: () => void;
  // Embedded (section) mode: rendered as one party's accordion inside
  // MultiPartyTaskDrawer. Drops the drawer's own backdrop/header/dropdown and
  // does NOT auto-close the surrounding modal — it relies on onSaved to let the
  // shell refresh per-party progress.
  embedded?: boolean;
  clientFirstName?: string | null;
  clientLastName?: string | null;
  onBehalf?: boolean;
  spouseName?: string | null;
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

const ALL_CAMERA_STEPS: SlotKey[] = ["primaryFront", "primaryBack", "secondaryFront", "secondaryBack"];
const SECONDARY_CAMERA_STEPS: SlotKey[] = ["secondaryFront", "secondaryBack"];

// ── Manual upload model (list of selected files with labels) ─────────────────

type LabelKey = "primary_front" | "primary_back" | "secondary_front" | "secondary_back" | "other";

type ExpiryStatus = "valid" | "expired" | "expiring_soon" | "unknown";

interface DocumentEntry {
  documentType: string;
  side: "front" | "back" | "front-and-back" | "unknown";
  sideRequirement: "single-sided" | "front-and-back" | "unknown";
  isComplete: boolean;
  // Passports only: true = signed, false = signature page visible but blank,
  // null/undefined = not visible or not a passport.
  signaturePresent?: boolean | null;
  confidence: "high" | "medium" | "low";
  expiryDate: string | null;
  expiryStatus: ExpiryStatus;
}

// A passport is unsigned when the detector saw the signature page and the line
// was blank. Other IDs (credit cards) keep the is_complete-based check.
function isUnsignedDoc(d: Pick<DocumentEntry, "documentType" | "side" | "isComplete" | "signaturePresent">): boolean {
  if (/passport/i.test(d.documentType)) return d.signaturePresent === false;
  return d.side === "front-and-back" && !d.isComplete;
}

interface DetectionResult {
  isIdentification: boolean;
  documentType: string | null;
  side: "front" | "back" | "front-and-back" | "unknown";
  sideRequirement: "single-sided" | "front-and-back" | "unknown";
  confidence: "high" | "medium" | "low";
  reason: string;
  expiryDate: string | null;
  expiryStatus: ExpiryStatus;
  // Multi-document support
  multipleDocuments?: DocumentEntry[];
  summary?: {
    totalDocuments: number;
    completeDocuments: number;
    documentTypesFound: string[];
  };
}

// custom_type stored with an uploaded document: "<type>_<side>", plus
// "_unsigned" for a passport whose signature page is blank so the block
// survives a Save-as-Draft → return round trip.
function buildCustomType(det: DetectionResult | null): string {
  if (!det?.documentType) return "identification";
  const unsignedPassport =
    /passport/i.test(det.documentType) &&
    !!det.multipleDocuments?.some((d) => d.documentType === det.documentType && isUnsignedDoc(d));
  return `${det.documentType}${det.side !== "unknown" ? `_${det.side}` : ""}${unsignedPassport ? "_unsigned" : ""}`;
}

interface SelectedFile {
  id: string;
  file: File;
  /**
   * Where the file already lives in Vercel Blob.
   *
   * Documents are uploaded straight from the browser to Blob the moment they're
   * picked (see stageFile), because Vercel caps a serverless function's request
   * body at ~4.5 MB — pushing a 10 MB PDF through /api/uploadblobstorage failed
   * at the platform edge before any of our code ran. Identification then
   * classifies BY URL, and Save/Draft only has to record the row.
   *
   * null while the upload is still in flight or if it failed.
   */
  blobUrl: string | null;
  uploading: boolean;
  uploadError: string | null;
  previewUrl: string | null;
  error: string | null;
  label: LabelKey;
  detecting: boolean;
  detection: DetectionResult | null;
  detectionError: string | null;
  isDuplicate: boolean;
  duplicateReason: string | null;
  fromCamera: boolean;
  // SHA-256 hash of the file's bytes. Used to detect *exact* duplicate uploads
  // (e.g. the same passport image uploaded twice) without flagging two
  // different files that happen to share a filename or byte size.
  contentHash: string | null;
}

interface ExistingDoc {
  id: string;
  file_name: string | null;
  file_url: string | null;
  custom_type: string | null;
  created_at: string | null;
}

const DOC_TYPE = "identification";
const SPOUSE_DOC_TYPE = "spouse_identification";

function idDocsUrl(leadId: string, spouseTaskId: string | null): string {
  return `/api/lead-identification-docs?lead_id=${encodeURIComponent(leadId)}${
    spouseTaskId ? `&task_id=${encodeURIComponent(spouseTaskId)}` : ""
  }`;
}
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".heic"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// Acceptable ID types that users can manually select when AI classification fails
const ACCEPTABLE_ID_TYPES = [
  "Canadian Passport",
  "Canadian Driver's License",
  "Canadian Citizenship Card",
  "Canadian Permanent Resident Card",
  "US or Canadian NEXUS Card",
  "Canadian SIN Card (plastic only)",
  "Foreign Passport",
  "Canadian Government-issued Photo ID Card",
  "Credit Card (with signature)",
  "Birth Certificate",
];

// Every acceptable ID now requires BOTH sides. Passports used to be the one
// exception — the photo/info page alone was treated as a complete document — and
// they no longer are: the reverse/signature page must be provided too.
//
// The `"single-sided"` value still exists in the wire and DB types because rows
// saved before this change carry it, and the parser must keep accepting it. What
// changed is that nothing in this component treats it as sufficient any more.

type ManualSide = "front" | "back" | "front-and-back";

// Human name for a document's SECOND side. On a passport that page is the
// signature page — the page the firm actually needs; calling it "the back"
// points people at the blank rear cover. Card-style IDs really do have a back.
function secondSideLabel(type: string): string {
  return /passport/i.test(type) ? "signature page" : "back";
}

const LABEL_OPTIONS: { value: LabelKey; text: string }[] = [
  { value: "primary_front", text: "Primary ID - Front" },
  { value: "primary_back", text: "Primary ID - Back" },
  { value: "secondary_front", text: "Secondary ID - Front" },
  { value: "secondary_back", text: "Secondary ID - Back" },
  { value: "other", text: "Other" },
];

const DEFAULT_ORDER: LabelKey[] = [
  "primary_front",
  "primary_back",
  "secondary_front",
  "secondary_back",
];

// Decode the `custom_type` stored on a previously-uploaded document back into a
// human-readable label so the classification survives a Save-as-Draft → return
// round trip. Stored values come in a few shapes:
//   - Detection-derived:  "Driver's License_front", "Permanent Resident Card_front-and-back"
//   - Legacy label keys:  "primary_front", "secondary_back", "other"
//   - Generic fallback:   "identification"
function formatExistingDocLabel(customType: string | null): string {
  if (!customType) return "Document";

  // Legacy/manual label keys (primary_front, secondary_back, …)
  const known = LABEL_OPTIONS.find((o) => o.value === customType);
  if (known) return known.text;

  if (customType === "identification") return "Identification";

  // Detection-derived format: "<Document Type>_<side>[_unsigned]"
  const match = /^(.*)_(front-and-back|front|back)(_unsigned)?$/i.exec(customType);
  if (match) {
    const type = match[1];
    const side = match[2].toLowerCase();
    const sideLabel =
      side === "front-and-back"
        ? "Front & Back"
        : side.charAt(0).toUpperCase() + side.slice(1);
    return `${type} — ${sideLabel}`;
  }

  // Document type with no side suffix — rows saved before both sides were
  // required, and the generic fallback.
  return customType;
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

// Compute a SHA-256 content hash for the given file. Two files with the same
// hash are bit-for-bit identical; two different files (even with the same name
// and byte size) will produce different hashes.
async function computeFileContentHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
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

/**
 * Turn a non-JSON / error response into something the user can act on.
 *
 * This matters because the failure that started all of this was invisible:
 * Vercel answers an oversized request with an HTML 413 page, `res.json()` threw,
 * and every cause collapsed into a single "Unable to process". Read the status
 * first and only fall back to a generic message when there's genuinely nothing
 * more specific to say.
 */
async function describeHttpFailure(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  if (data && typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }
  switch (res.status) {
    case 401:
    case 403:
      return "Your session has expired. Please sign in again and retry.";
    case 413:
      return "File is too large to process (max 10 MB).";
    case 415:
      return "Unsupported file type. Please upload a PDF, JPG, PNG or HEIC.";
    case 429:
      return "Too many document checks in a short time. Please wait a moment and try again.";
    case 504:
      return "Document verification timed out. Please try again.";
    default:
      return `Document verification failed (HTTP ${res.status}).`;
  }
}

/**
 * Classify a document that is ALREADY stored in Vercel Blob.
 *
 * Only the URL is posted — the bytes are read back server-side. Previously the
 * whole file was posted as multipart, which Vercel refused above ~4.5 MB.
 */
async function fetchDetection(
  blobUrl: string,
  file: File,
  timeoutMs = 50_000,
): Promise<DetectionFetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/identify-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_url: blobUrl,
        file_name: file.name,
        mime_type: file.type || undefined,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: await describeHttpFailure(res) };
    }
    const data = await res
      .json()
      .catch(() => ({ success: false, error: "Invalid response from server." }));
    if (!data.success) {
      return { ok: false, error: data.error ?? "Detection failed." };
    }
    const r = data.result as {
      is_identification: boolean;
      document_type: string | null;
      side: "front" | "back" | "front-and-back" | "unknown";
      side_requirement: "single-sided" | "front-and-back" | "unknown";
      confidence: "high" | "medium" | "low";
      reason: string;
      expiry_date: string | null;
      expiry_status: ExpiryStatus;
      multiple_documents?: Array<{
        document_type: string;
        side: "front" | "back" | "front-and-back" | "unknown";
        side_requirement: "single-sided" | "front-and-back" | "unknown";
        is_complete: boolean;
        signature_present?: boolean | null;
        confidence: "high" | "medium" | "low";
        expiry_date: string | null;
        expiry_status: ExpiryStatus;
      }>;
      summary?: {
        total_documents: number;
        complete_documents: number;
        document_types_found: string[];
      };
    };

    const multipleDocuments = r.multiple_documents?.map((d) => ({
      documentType: d.document_type,
      side: d.side,
      sideRequirement: d.side_requirement,
      isComplete: d.is_complete,
      signaturePresent: d.signature_present ?? null,
      confidence: d.confidence,
      expiryDate: d.expiry_date ?? null,
      expiryStatus: d.expiry_status ?? "unknown",
    }));

    const summary = r.summary ? {
      totalDocuments: r.summary.total_documents,
      completeDocuments: r.summary.complete_documents,
      documentTypesFound: r.summary.document_types_found,
    } : undefined;

    return {
      ok: true,
      detection: {
        isIdentification: r.is_identification,
        documentType: r.document_type,
        side: r.side,
        sideRequirement: r.side_requirement ?? "unknown",
        confidence: r.confidence,
        reason: r.reason,
        expiryDate: r.expiry_date ?? null,
        expiryStatus: r.expiry_status ?? "unknown",
        multipleDocuments,
        summary,
      },
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Document verification is taking longer than expected. Please try again with a clearer image or smaller file size."
        : err instanceof Error
          ? err.message
          : "Detection failed.";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

function detectionFields(det: DetectionResult | null): Record<string, unknown> {
  if (!det) return {};
  return {
    is_identification: det.isIdentification,
    document_type: det.documentType ?? undefined,
    side: det.side,
    side_requirement: det.sideRequirement,
    confidence: det.confidence,
    detection_reason: det.reason || undefined,
  };
}

/**
 * Upload a document straight from the browser to Vercel Blob.
 *
 * The token comes from /api/blob/upload, which pins the allowed content types
 * and (for identification) the 10 MB ceiling server-side — the browser cannot
 * widen either. The bytes never pass through a serverless function, which is
 * what lets a 10 MB file through at all (Vercel's request-body cap is ~4.5 MB).
 * The resulting pathname is byte-for-byte the shape the old server-side put()
 * produced, so stored URLs, the download proxy and every existing row keep
 * working unchanged.
 */
async function uploadFileToBlob(
  file: File,
  leadId: string,
  spouseTaskId: string | null,
): Promise<string> {
  const blob = await upload(
    `corporate-docs/${leadId}/${Date.now()}-${file.name}`,
    file,
    {
      access: BLOB_ACCESS,
      handleUploadUrl: "/api/blob/upload",
      contentType: file.type || undefined,
      clientPayload: JSON.stringify({
        lead_id: leadId,
        doc_type: spouseTaskId ? SPOUSE_DOC_TYPE : DOC_TYPE,
      }),
    },
  );
  return blob.url;
}

/** Human-readable reason a direct-to-Blob upload failed. */
function describeUploadError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  const lower = raw.toLowerCase();
  if (lower.includes("too large") || lower.includes("maximum size")) {
    return "File is too large (max 10 MB).";
  }
  if (lower.includes("content type") || lower.includes("not allowed")) {
    return "Unsupported file type. Please upload a PDF, JPG, PNG or HEIC.";
  }
  if (lower.includes("token") && lower.includes("expired")) {
    return "The upload took too long to start. Please try again.";
  }
  if (lower.includes("unauthorized") || lower.includes("401")) {
    return "Your session has expired. Please sign in again and retry.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Upload failed — check your connection and try again.";
  }
  return raw || "Upload failed. Please try again.";
}

/**
 * Record an already-uploaded blob as a document row. Posts JSON (a few hundred
 * bytes), never the file itself.
 */
async function registerUploadedDoc(payload: {
  leadId: string;
  spouseTaskId: string | null;
  blobUrl: string;
  fileName: string;
  customType: string;
  detection: DetectionResult | null;
}): Promise<string> {
  const res = await fetch("/api/uploadblobstorage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_url: payload.blobUrl,
      file_name: payload.fileName,
      lead_id: payload.leadId,
      doc_type: payload.spouseTaskId ? SPOUSE_DOC_TYPE : DOC_TYPE,
      ...(payload.spouseTaskId ? { task_id: payload.spouseTaskId } : {}),
      custom_type: payload.customType,
      ...detectionFields(payload.detection),
    }),
  });

  if (!res.ok) {
    throw new Error(await describeHttpFailure(res));
  }
  const data = await res
    .json()
    .catch(() => ({ success: false, error: "Invalid response from server." }));
  if (!data.success) throw new Error(data.error ?? "Upload failed");

  const url: string | undefined = data.url ?? data.file_url;
  if (!url) throw new Error("Upload did not return a URL.");
  return url;
}

/**
 * Delete a blob that was uploaded but never saved (file removed from the
 * picker, or the drawer closed without saving). Fire-and-forget: the server
 * refuses to touch anything a document row already references.
 */
function discardUploadedBlob(blobUrl: string | null | undefined) {
  if (!blobUrl) return;
  void fetch(`/api/uploadblobstorage?url=${encodeURIComponent(blobUrl)}`, {
    method: "DELETE",
    keepalive: true,
  }).catch(() => {
    /* best-effort cleanup — a leftover blob is not worth surfacing */
  });
}

// ── Acceptable Documents Section (LSO By-Law 7.1) ────────────────────────────

function AcceptableDocumentsSection() {
  const acceptableDocs = [
    "Canadian Passport",
    "Canadian Driver's License",
    "Canadian Citizenship Card",
    "Canadian Permanent Resident Card",
    "US or Canadian NEXUS Card",
    "Canadian SIN Card (plastic only)",
    "Foreign Passport",
    "Canadian Government-issued Photo ID Card",
    "Credit Card (with signature)",
    "Birth Certificate",
  ];

  return (
    <div className="rounded-xl border border-[#C10007]/20 bg-[#FEF2F2] overflow-hidden">
      <div className="px-4 py-3.5 border-b border-[#C10007]/10">
        <span className="text-sm font-bold text-gray-900">
          Acceptable Identification Documents
        </span>
      </div>
      <div className="px-4 py-4 bg-white space-y-4">
        <p className="text-xs text-gray-600 leading-relaxed">
          Please provide{" "}
          <span className="font-bold text-[#C10007]">two different pieces of identification</span>{" "}
          from the list below for identity verification. We need{" "}
          <span className="font-semibold text-gray-800">both sides of each ID</span> — for a
          passport, that is the photo page and the signature page, and for a credit card the back
          must show your signature.
        </p>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {acceptableDocs.map((doc) => (
            <div key={doc} className="flex items-center gap-2 text-xs text-gray-700">
              <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
              <span>{doc}</span>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2 pt-3 border-t border-gray-100">
          <AlertCircle size={13} className="text-[#C10007] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500">
            <span className="font-semibold text-gray-700">Note:</span> Health cards and
            Citizenship Certificates are not acceptable. Credit Card, if uploaded, will only be
            used for ID verification purposes.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Why Identification Required Dropdown ───────────────────────────────────────

function WhyIdentificationRequiredDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <span className="text-sm font-medium text-gray-700">
          Why is Identification Required?
        </span>
        <ChevronDown
          size={18}
          className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="px-4 py-3 bg-white border-t border-gray-100 space-y-2 text-xs text-gray-600 leading-relaxed">
          <p>
            Government-issued identification is required to verify your identity and comply with
            legal requirements for property transactions.
          </p>
          <p>
            This helps prevent fraud and ensures all parties are properly identified before
            proceeding with the closing.
          </p>
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
  embedded = false,
  spouseName,
}: UploadIdentificationDrawerProps) {
  const spouseTaskId = spouseName && taskId ? taskId : null;
  const isLargeScreen = useIsLargeScreen();
  // Manual upload state
  const [selected, setSelected] = useState<SelectedFile[]>([]);
  const [existing, setExisting] = useState<ExistingDoc[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<SelectedFile[]>([]);
  const verificationStatusRef = useRef<HTMLDivElement>(null);

  // Keep selectedRef in sync so detection callbacks can read the current file name
  // without being inside a setState updater
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Error modal state - simplified unified error popup
  type ErrorKind = "invalid_id" | "expired" | "unable_to_process" | "invalid_file_type" | "file_too_large" | "resolution_issue";
  
  const [errorModal, setErrorModal] = useState<{
    open: boolean;
    fileId: string;
    fileName: string;
    kind: ErrorKind;
    documentType?: string;
    expiryDate?: string;
    customReason?: string;
  }>({ open: false, fileId: "", fileName: "", kind: "invalid_id" });

  type ErrorModalPayload = {
    fileId: string;
    fileName: string;
    kind: ErrorKind;
    documentType?: string;
    expiryDate?: string;
    customReason?: string;
  };

  const errorModalQueueRef = useRef<ErrorModalPayload[]>([]);
  const errorModalOpenRef = useRef(false);

  function openErrorModal(payload: ErrorModalPayload) {
    if (errorModalOpenRef.current) {
      errorModalQueueRef.current.push(payload);
      return;
    }
    errorModalOpenRef.current = true;
    setErrorModal({ ...payload, open: true });
  }

  function closeErrorModal() {
    errorModalOpenRef.current = false;
    setErrorModal({
      open: false,
      fileId: "",
      fileName: "",
      kind: "invalid_id",
    });
    const next = errorModalQueueRef.current.shift();
    if (next) {
      errorModalOpenRef.current = true;
      setErrorModal({ ...next, open: true });
    }
  }
  
  const getErrorModalTitle = (kind: ErrorKind): string => {
    switch (kind) {
      case "expired":
        return "This ID has expired";
      case "invalid_id":
      case "invalid_file_type":
        return "Invalid ID";
      case "unable_to_process":
      case "file_too_large":
      case "resolution_issue":
      default:
        return "We weren't able to process this file";
    }
  };
  
  const getErrorModalMessage = (kind: ErrorKind, documentType?: string, expiryDate?: string, customReason?: string): string => {
    switch (kind) {
      case "expired":
        return `Your ${documentType || "ID"} expired on ${expiryDate || "an unknown date"}. Expired IDs cannot be used for identity verification.`;
      case "invalid_id":
        return customReason || "Health cards and Citizenship Certificates cannot be used for identity verification. Please upload a document from the accepted list, such as a passport, driver's licence or Citizenship Card.";
      case "invalid_file_type":
        return "This file type is not supported. Please upload a PDF, JPG, PNG, or HEIC file.";
      case "file_too_large":
        return "This file is too large. Please upload a file smaller than 10 MB.";
      case "resolution_issue":
        return "ID details not readable. Please upload a clearer image or scan.";
      case "unable_to_process":
      default:
        return customReason || "We couldn't process this file. Please try again with a clearer image or smaller file size.";
    }
  };

  // Manual classification modal (when AI can't classify correctly)
  const [manualClassifyModal, setManualClassifyModal] = useState<{
    open: boolean;
    fileId: string;
    fileName: string;
    selectedType: string;
    selectedSide: ManualSide;
  }>({ open: false, fileId: "", fileName: "", selectedType: "", selectedSide: "front" });

  // Confirmation modal before submission
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Camera flow state (guided capture — number of steps depends on what's still needed)
  const webcamRef = useRef<Webcam | null>(null);
  const [cameraFlowOpen, setCameraFlowOpen] = useState(false);
  const [cameraStepIndex, setCameraStepIndex] = useState(0);
  const [cameraSteps, setCameraSteps] = useState<SlotKey[]>(ALL_CAMERA_STEPS);
  const [cameraCapturedFiles, setCameraCapturedFiles] = useState<Partial<Record<SlotKey, File>>>({});
  const [cameraCapturedPreview, setCameraCapturedPreview] = useState<Partial<Record<SlotKey, string>>>({});
  const [currentCapture, setCurrentCapture] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [sharpnessScore, setSharpnessScore] = useState<number | null>(null);
  const [sharpnessOk, setSharpnessOk] = useState(false);
  const [validatingImage, setValidatingImage] = useState(false);
  const [cameraSubmitting, setCameraSubmitting] = useState(false);
  const [retakingSlot, setRetakingSlot] = useState<SlotKey | null>(null);

  const resetAll = useCallback(() => {
    selected.forEach((s) => {
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      // Staged-but-never-saved files were already uploaded to Blob (that's how
      // identification reads them). Closing the drawer abandons them, so clean
      // the bytes up — the server ignores anything a saved row references.
      discardUploadedBlob(s.blobUrl);
    });
    setSelected([]);
    setExisting([]);
    setGlobalError(null);
    setUploading(false);
    setSavingDraft(false);
    setDraftSaved(false);
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
    setRetakingSlot(null);
    setShowConfirmModal(false);
    errorModalQueueRef.current = [];
    errorModalOpenRef.current = false;
    setErrorModal({ open: false, fileId: "", fileName: "", kind: "invalid_id" });
  }, [selected]);

  const handleClose = useCallback(() => {
    resetAll();
    onClose();
  }, [onClose, resetAll]);

  // Clear any in-progress (unsaved) selection when the target person changes via
  // the on-behalf dropdown — leadId switches, so files picked for one person must
  // not be uploaded under another. The existing-docs effect below reloads the
  // newly-selected person's saved docs.
  // Client and spouse share a lead.
  const docOwnerKey = `${leadId ?? ""}:${spouseTaskId ?? ""}`;
  const prevLeadIdRef = useRef(docOwnerKey);
  useEffect(() => {
    if (!open) {
      prevLeadIdRef.current = docOwnerKey;
      return;
    }
    if (prevLeadIdRef.current !== docOwnerKey) {
      prevLeadIdRef.current = docOwnerKey;
      setSelected((prev) => {
        prev.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
        return [];
      });
      setGlobalError(null);
      setDraftSaved(false);
    }
  }, [open, docOwnerKey]);

  // Load existing docs when drawer opens
  useEffect(() => {
    if (!open || !leadId) return;
    let cancelled = false;
    setLoadingExisting(true);
    fetch(idDocsUrl(leadId, spouseTaskId))
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
  }, [open, leadId, spouseTaskId]);

  // Close on Escape — the shell owns this in embedded mode.
  useEffect(() => {
    if (embedded) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) handleClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, handleClose, embedded]);

  // Lock body scroll — the shell owns this in embedded mode.
  useEffect(() => {
    if (embedded) return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, embedded]);

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

  // Recompute duplicate flags for all files — duplicates are detected ONLY when
  // the exact same FILE is uploaded more than once (bit-for-bit identical
  // content, verified via SHA-256 hash). Two different files classified as the
  // same document type (e.g. two different passport scans, one per person) are
  // NEVER treated as duplicates.
  //
  // While a file's hash is still being computed, we conservatively skip the
  // check for that file — it'll be re-evaluated automatically once the hash is
  // available.
  function recomputeDuplicates(files: SelectedFile[]): SelectedFile[] {
    return files.map((file, index) => {
      let isDuplicate = false;
      let duplicateReason: string | null = null;

      if (file.contentHash) {
        for (let i = 0; i < index; i++) {
          const other = files[i];
          if (other.contentHash && other.contentHash === file.contentHash) {
            isDuplicate = true;
            duplicateReason = "This exact file has already been uploaded.";
            break;
          }
        }
      }

      return { ...file, isDuplicate, duplicateReason };
    });
  }

  // Compute a content hash for the given file, then re-run duplicate detection
  // across the current selection. Fire-and-forget from the caller.
  async function attachContentHash(id: string, file: File) {
    try {
      const hash = await computeFileContentHash(file);
      setSelected((prev) => {
        const updated = prev.map((s) =>
          s.id === id ? { ...s, contentHash: hash } : s,
        );
        return recomputeDuplicates(updated);
      });
    } catch {
      /* If hashing fails we leave contentHash null — the file simply won't be
         flagged as a duplicate, which is the safer default. */
    }
  }

  /**
   * Stage a freshly-picked file: upload it to Blob first, then classify it by
   * URL. The upload has to happen up front because identification now reads the
   * document server-side from storage — and because a 4.5–10 MB file simply
   * cannot be posted to an API route on Vercel.
   *
   * If the user removes the file or closes the drawer without saving,
   * discardUploadedBlob() cleans the bytes up.
   */
  async function stageFile(id: string, file: File, leadIdForUpload: string) {
    let blobUrl: string;
    try {
      blobUrl = await uploadFileToBlob(file, leadIdForUpload, spouseTaskId);
    } catch (err: unknown) {
      const message = describeUploadError(err);
      setSelected((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                uploading: false,
                uploadError: message,
                detecting: false,
                detectionError: message,
              }
            : s,
        ),
      );
      openErrorModal({
        fileId: id,
        fileName: file.name,
        kind: message.toLowerCase().includes("too large")
          ? "file_too_large"
          : "unable_to_process",
        customReason: message,
      });
      return;
    }

    setSelected((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, blobUrl, uploading: false, uploadError: null } : s,
      ),
    );

    await detectIdentification(id, blobUrl, file);
  }

  async function detectIdentification(id: string, blobUrl: string, file: File) {
    const result = await fetchDetection(blobUrl, file);
    const fileName = selectedRef.current.find((s) => s.id === id)?.file.name ?? "";

    if (!result.ok) {
      setSelected((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, detecting: false, detection: null, detectionError: result.error }
            : s,
        ),
      );
      const isResolutionIssue =
        result.error.toLowerCase().includes("blur") ||
        result.error.toLowerCase().includes("unclear") ||
        result.error.toLowerCase().includes("readable");

      openErrorModal({
        fileId: id,
        fileName,
        kind: isResolutionIssue ? "resolution_issue" : "unable_to_process",
        customReason: result.error,
      });
      return;
    }

    // Update this file's detection result first
    setSelected((prev) => {
      const updated = prev.map((s) =>
        s.id === id
          ? { ...s, detecting: false, detection: result.detection, detectionError: null }
          : s
      );
      
      // Now recompute duplicates for ALL files based on the new state
      return recomputeDuplicates(updated);
    });
    
    // Scroll to verification status section after detection completes
    setTimeout(() => {
      verificationStatusRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
    
    if (!result.detection.isIdentification) {
      openErrorModal({
        fileId: id,
        fileName,
        kind: "invalid_id",
        customReason: result.detection.reason?.trim() || undefined,
      });
    } else if (result.detection.expiryStatus === "expired") {
      openErrorModal({
        fileId: id,
        fileName,
        kind: "expired",
        documentType: result.detection.documentType ?? undefined,
        expiryDate: result.detection.expiryDate ?? undefined,
      });
    }
  }

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    const queuedForStaging: { id: string; file: File }[] = [];
    const additions: SelectedFile[] = [];
    const working = [...selected];

    if (!leadId) {
      setGlobalError("Missing lead. Please refresh and try again.");
      return;
    }

    for (const f of incoming) {
      const err = validateFile(f);
      if (err) {
        const isFileTooLarge = err.includes("10 MB") || err.toLowerCase().includes("size");
        openErrorModal({
          fileId: "",
          fileName: f.name,
          kind: isFileTooLarge ? "file_too_large" : "invalid_file_type",
        });
        continue;
      }

      const id = makeId();
      const nextItem: SelectedFile = {
        id,
        file: f,
        blobUrl: null,
        uploading: true,
        uploadError: null,
        previewUrl: isImageFile(f) ? URL.createObjectURL(f) : null,
        error: null,
        label: nextDefaultLabel(working, existing),
        detecting: true,
        detection: null,
        detectionError: null,
        isDuplicate: false,
        duplicateReason: null,
        fromCamera: false,
        contentHash: null,
      };
      additions.push(nextItem);
      working.push(nextItem);
      queuedForStaging.push({ id, file: f });
    }

    if (additions.length > 0) {
      setSelected((prev) => recomputeDuplicates([...prev, ...additions]));
    }

    setGlobalError(null);

    // Upload each file to Blob, then run Gemini detection on it; hash it for
    // duplicate detection in parallel (fire-and-forget). Duplicate flags update
    // automatically once each hash resolves.
    queuedForStaging.forEach(({ id, file }) => {
      void stageFile(id, file, leadId);
      void attachContentHash(id, file);
    });
  }

  function removeSelected(id: string) {
    setSelected((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      // The bytes are already in Blob (uploaded at pick time) but nothing
      // references them yet — drop them so an abandoned pick doesn't leak.
      discardUploadedBlob(target?.blobUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  function openManualClassify(fileId: string, fileName: string) {
    errorModalQueueRef.current = [];
    closeErrorModal();
    
    // Pre-fill with existing detection if available
    const existingFile = selected.find((s) => s.id === fileId);
    const existingDetection = existingFile?.detection;
    
    setManualClassifyModal({
      open: true,
      fileId,
      fileName,
      selectedType: existingDetection?.isIdentification && existingDetection.documentType ? existingDetection.documentType : "",
      selectedSide: existingDetection?.side && existingDetection.side !== "unknown" ? existingDetection.side : "front",
    });
  }

  function applyManualClassification() {
    const { fileId, selectedType, selectedSide } = manualClassifyModal;
    if (!selectedType) return;

    const manualDetection: DetectionResult = {
      isIdentification: true,
      documentType: selectedType,
      side: selectedSide,
      // Every acceptable ID needs both sides, so a manual classification can
      // never mark a document satisfied by the one side in front of the user.
      sideRequirement: "front-and-back",
      confidence: "high",
      reason: "Manually classified by user",
      expiryDate: null,
      expiryStatus: "unknown",
    };

    setSelected((prev) => {
      const updated = prev.map((s) =>
        s.id === fileId
          ? { ...s, detection: manualDetection, detectionError: null, detecting: false }
          : s
      );
      return recomputeDuplicates(updated);
    });

    setManualClassifyModal({ open: false, fileId: "", fileName: "", selectedType: "", selectedSide: "front" });
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

      // Same two-step as a fresh upload: bytes straight to Blob, then a small
      // JSON call to record the row.
      let blobUrl: string;
      try {
        blobUrl = await uploadFileToBlob(file, leadId, spouseTaskId);
      } catch (uploadErr: unknown) {
        throw new Error(describeUploadError(uploadErr));
      }

      try {
        await registerUploadedDoc({
          leadId,
          spouseTaskId,
          blobUrl,
          fileName: file.name,
          customType: existingDoc?.custom_type || "identification",
          detection: null,
        });
      } catch (registerErr) {
        discardUploadedBlob(blobUrl);
        throw registerErr;
      }

      const delRes = await fetch(`/api/lead-identification-docs?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const delData = await delRes.json();
      if (!delData.success) throw new Error(delData.error ?? "Failed to remove old file");

      const r = await fetch(idDocsUrl(leadId, spouseTaskId));
      const d = await r.json();
      if (d.success) setExisting(d.docs ?? []);
    } catch (e: unknown) {
      setGlobalError(e instanceof Error ? e.message : "Failed to replace file.");
    } finally {
      setReplacingId(null);
    }
  }

  // ── Camera flow handlers ────────────────────────────────────────────────────

  const currentCameraSlot = cameraSteps[cameraStepIndex] ?? null;
  const cameraCapturedCount = Object.keys(cameraCapturedFiles).length;
  const cameraFlowReadyToSubmit =
    cameraSteps.length > 0 && cameraSteps.every((k) => !!cameraCapturedFiles[k]);

  // Count IDs already provided in this drawer so the camera only asks for what's left
  function countAlreadyProvidedIds(): number {
    // Count complete IDs in the current selection (separate front + back, or a
    // single image showing both sides)
    const selectedComplete = docAnalysis.filter((d) => d.complete).length;

    // Count distinct base types in previously uploaded docs as already-provided IDs
    const existingPrefixes = new Set<string>();
    for (const doc of existing) {
      if (!doc.custom_type) continue;
      const prefix = doc.custom_type
        .replace(/_front(_unsigned)?$|_back(_unsigned)?$|_front-and-back(_unsigned)?$/i, "")
        .toLowerCase()
        .trim();
      if (prefix) existingPrefixes.add(prefix);
    }

    return selectedComplete + existingPrefixes.size;
  }

  // Decide which camera slots to walk the user through based on what's still missing
  function computeCameraStepsNeeded(): SlotKey[] {
    const alreadyProvided = countAlreadyProvidedIds();
    if (alreadyProvided >= 2) return [];
    if (alreadyProvided === 1) return SECONDARY_CAMERA_STEPS;
    return ALL_CAMERA_STEPS;
  }

  function openCameraFlow() {
    const stepsNeeded = computeCameraStepsNeeded();
    setCameraSteps(stepsNeeded.length > 0 ? stepsNeeded : ALL_CAMERA_STEPS);
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
    setRetakingSlot(null);
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

    // If retaking a single slot, return to review screen
    if (retakingSlot) {
      setCameraStepIndex(cameraSteps.length);
      setCurrentCapture(null);
      setCameraError(null);
      setSharpnessScore(null);
      setSharpnessOk(false);
      setValidatingImage(false);
      setRetakingSlot(null);
      return;
    }

    if (cameraStepIndex < cameraSteps.length - 1) {
      setCameraStepIndex((prev) => prev + 1);
      setCurrentCapture(null);
      setCameraError(null);
      setSharpnessScore(null);
      setSharpnessOk(false);
      setValidatingImage(false);
      return;
    }

    setCameraStepIndex(cameraSteps.length);
    setCurrentCapture(null);
    setCameraError(null);
    setSharpnessScore(null);
    setSharpnessOk(false);
    setValidatingImage(false);
  }

  function openCameraStep(stepKey: SlotKey) {
    const nextIndex = cameraSteps.indexOf(stepKey);
    if (nextIndex < 0) return;
    setCameraStepIndex(nextIndex);
    setCurrentCapture(null);
    setCameraError(null);
    setSharpnessScore(null);
    setSharpnessOk(false);
    setValidatingImage(false);
    setRetakingSlot(null);
  }

  function retakeSingleSlot(stepKey: SlotKey) {
    const nextIndex = cameraSteps.indexOf(stepKey);
    if (nextIndex < 0) return;
    setCameraStepIndex(nextIndex);
    setCurrentCapture(null);
    setCameraError(null);
    setSharpnessScore(null);
    setSharpnessOk(false);
    setValidatingImage(false);
    setRetakingSlot(stepKey);
  }

  async function handleFinishCameraFlow() {
    if (!cameraFlowReadyToSubmit) {
      setCameraError(
        cameraSteps.length === ALL_CAMERA_STEPS.length
          ? "Please capture front and back for both IDs before finishing."
          : "Please capture front and back of the remaining ID before finishing.",
      );
      return;
    }

    if (!leadId) {
      setCameraError("Missing lead. Please refresh and try again.");
      return;
    }

    // Convert camera captures to SelectedFile entries and add to selected state
    const newFiles: SelectedFile[] = [];
    const queuedForStaging: { id: string; file: File }[] = [];

    for (const slotKey of cameraSteps) {
      const file = cameraCapturedFiles[slotKey];
      const preview = cameraCapturedPreview[slotKey];
      if (!file) continue;

      const id = makeId();
      const newEntry: SelectedFile = {
        id,
        file,
        blobUrl: null,
        uploading: true,
        uploadError: null,
        previewUrl: preview ?? null,
        error: null,
        label: SLOT_CUSTOM_TYPES[slotKey],
        detecting: true,
        detection: null,
        detectionError: null,
        isDuplicate: false,
        duplicateReason: null,
        fromCamera: true,
        contentHash: null,
      };
      newFiles.push(newEntry);
      queuedForStaging.push({ id, file });
    }

    if (newFiles.length > 0) {
      setSelected((prev) => recomputeDuplicates([...prev, ...newFiles]));
    }

    closeCameraFlow();

    // Upload each capture to Blob, then run AI detection on it, plus SHA-256
    // hashing. Duplicate flags update automatically once each hash resolves.
    queuedForStaging.forEach(({ id, file }) => {
      void stageFile(id, file, leadId);
      void attachContentHash(id, file);
    });
  }

  // Add camera captures to selected files for review
  function handleFinishCameraFlowClick() {
    if (!cameraFlowReadyToSubmit) {
      setCameraError("Please capture front and back for both IDs before finishing.");
      return;
    }
    handleFinishCameraFlow();
  }

  // ── Manual upload submit ────────────────────────────────────────────────────

  async function handleUpload() {
    if (!leadId) {
      setGlobalError("Missing lead. Please refresh and try again.");
      return;
    }
    // Require two fully-verified IDs (2/2) before submission — counting any
    // previously-uploaded draft docs so a returning user can finish without
    // re-uploading everything they already provided.
    if (hasExpiredDocs) {
      setGlobalError("One of your IDs is expired. Please remove or replace it before submitting.");
      verificationStatusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (hasUnsignedDocs) {
      setGlobalError("Signature missing — the signature page of your ID is visible but unsigned. Please sign it and re-upload.");
      verificationStatusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (completeDocCount < 2) {
      setGlobalError("Please provide two valid pieces of ID (2/2) before submitting.");
      verificationStatusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (hasIncompleteIds) {
      setGlobalError(
        `Both sides of every ID are required — upload the ${describeMissingSides(incompleteIds[0])} of your ${incompleteIds[0].type} (for a passport, the photo page and the signature page) or remove that document.`,
      );
      verificationStatusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setUploading(true);
    setGlobalError(null);

    try {
      // The bytes are already in Blob (uploaded when each file was picked), so
      // this only records the rows.
      const uploads = selected.map(async (s) => {
        if (!s.blobUrl) {
          throw new Error(
            `${s.file.name}: ${s.uploadError ?? "this file was not uploaded successfully. Please remove it and try again."}`,
          );
        }
        // Use detected document type and side as custom_type
        const customType = buildCustomType(s.detection);
        try {
          const url = await registerUploadedDoc({
            leadId,
            spouseTaskId,
            blobUrl: s.blobUrl,
            fileName: s.file.name,
            customType,
            detection: s.detection,
          });
          return { selected: s, url };
        } catch (err: unknown) {
          throw new Error(
            `${s.file.name}: ${err instanceof Error ? err.message : "Upload failed"}`,
          );
        }
      });

      const uploaded = await Promise.all(uploads);

      if (taskId) {
        // The task-responses API replaces ALL responses for the task, so we
        // must include previously-uploaded draft docs alongside the new ones —
        // otherwise finishing a draft would drop the earlier documents.
        const existingResponses = existing.map((doc) => ({
          field_label: doc.custom_type
            ? formatExistingDocLabel(doc.custom_type)
            : "Identification Document",
          field_type: "file",
          file_url: doc.file_url,
          file_name: doc.file_name,
        }));
        const respRes = await fetch("/api/task-responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task_id: taskId,
            responses: [
              ...uploaded.map(({ selected: s, url }) => ({
                field_label: s.detection?.documentType 
                  ? `${s.detection.documentType}${s.detection.side !== "unknown" ? ` (${s.detection.side})` : ""}`
                  : "Identification Document",
                field_type: "file",
                file_url: url,
                file_name: s.file.name,
              })),
              ...existingResponses,
            ],
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
        const r = await fetch(idDocsUrl(leadId, spouseTaskId));
        const d = await r.json();
        if (d.success) setExisting(d.docs ?? []);
      } catch {}
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : "One or more uploads failed.");
    } finally {
      setUploading(false);
    }
  }

  // Validate before showing confirmation modal
  function handleUploadClick() {
    if (!leadId) {
      setGlobalError("Missing lead. Please refresh and try again.");
      return;
    }
    if (hasExpiredDocs) {
      setGlobalError("One of your IDs is expired. Please remove or replace it before submitting.");
      verificationStatusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (hasUnsignedDocs) {
      setGlobalError("Signature missing — the signature page of your ID is visible but unsigned. Please sign it and re-upload.");
      verificationStatusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (completeDocCount < 2) {
      setGlobalError("Please provide two valid pieces of ID (2/2) before submitting.");
      verificationStatusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (hasIncompleteIds) {
      setGlobalError(
        `Both sides of every ID are required — upload the ${describeMissingSides(incompleteIds[0])} of your ${incompleteIds[0].type} (for a passport, the photo page and the signature page) or remove that document.`,
      );
      verificationStatusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setShowConfirmModal(true);
  }

  // Save current selection as a draft — uploads files to blob storage but does
  // NOT mark the task as completed. Skips files that are still being analyzed
  // or have failed detection (we don't want to persist known-invalid IDs).
  async function handleSaveDraft() {
    if (!leadId) {
      setGlobalError("Missing lead. Please refresh and try again.");
      return;
    }

    // Nothing in the picker → nothing to save. Just close gracefully — but in
    // embedded mode never close the surrounding multi-party modal.
    if (selected.length === 0) {
      if (!embedded) handleClose();
      return;
    }

    // A file with no blobUrl never made it into storage (its upload failed), so
    // there is nothing to record for it — skip rather than fail the whole draft.
    const validToSave = selected.filter(
      (s) => !s.detecting && !s.uploading && !s.isDuplicate && !!s.blobUrl,
    );

    if (validToSave.length === 0) {
      setGlobalError(
        "No saveable documents — please wait for the upload and analysis to finish, or remove duplicate/failed files.",
      );
      return;
    }

    setSavingDraft(true);
    setGlobalError(null);

    try {
      const uploads = validToSave.map(async (s) => {
        if (!s.blobUrl) {
          throw new Error(
            `${s.file.name}: ${s.uploadError ?? "this file was not uploaded successfully. Please remove it and try again."}`,
          );
        }
        const customType = buildCustomType(s.detection);
        try {
          await registerUploadedDoc({
            leadId,
            spouseTaskId,
            blobUrl: s.blobUrl,
            fileName: s.file.name,
            customType,
            detection: s.detection,
          });
        } catch (err: unknown) {
          throw new Error(
            `${s.file.name}: ${err instanceof Error ? err.message : "Upload failed"}`,
          );
        }
      });

      await Promise.all(uploads);

      // Clear in-memory selection + refresh existing docs from DB so the user
      // sees their saved state immediately if they don't navigate away.
      const savedIds = new Set(validToSave.map((s) => s.id));
      selected.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
        // Files skipped by the draft filter (still analyzing, duplicates) were
        // uploaded but never recorded — drop their bytes rather than leak them.
        if (!savedIds.has(s.id)) discardUploadedBlob(s.blobUrl);
      });
      setSelected([]);

      try {
        const r = await fetch(
          idDocsUrl(leadId, spouseTaskId),
        );
        const d = await r.json();
        if (d.success) setExisting(d.docs ?? []);
      } catch {
        /* non-fatal — the docs are saved; reload just refreshes the UI */
      }

      setDraftSaved(true);
      if (embedded) {
        // Embedded: keep the shell open and let it refresh per-party progress.
        onSaved?.();
      } else {
        setTimeout(() => handleClose(), 1500);
      }
    } catch (err: unknown) {
      setGlobalError(
        err instanceof Error ? err.message : "Failed to save draft.",
      );
    } finally {
      setSavingDraft(false);
    }
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  // Group detected documents by type to determine if both sides are present.
  // Supports multiple documents detected in a single file.
  //
  // Only the SIDE is carried forward. The detector's `sideRequirement` and
  // `isComplete` are deliberately left behind: completeness is now decided in
  // `docAnalysis` from the sides actually present, so keeping a field here named
  // "isComplete" that no longer decides completeness would only mislead. Both
  // values are still persisted with the document by `detectionFields()`.
  const detectedDocs: { type: string; side: string; fileId: string; expired: boolean; unsigned: boolean }[] = [];
  for (const s of selected) {
    if (s.detection?.isIdentification) {
      const expired = s.detection.expiryStatus === "expired";
      // If multiple documents were detected in this file, add each one
      if (s.detection.multipleDocuments && s.detection.multipleDocuments.length > 0) {
        for (const doc of s.detection.multipleDocuments) {
          detectedDocs.push({
            type: doc.documentType,
            side: doc.side,
            fileId: s.id,
            expired,
            // Both required sides are present but the detector flagged the
            // document itself incomplete — this is the signature-missing
            // case (blank signature page/strip), not a missing-side case.
            unsigned: isUnsignedDoc(doc),
          });
        }
      } else if (s.detection.documentType) {
        // Single document detection (backward compatibility)
        detectedDocs.push({
          type: s.detection.documentType,
          side: s.detection.side,
          fileId: s.id,
          expired,
          unsigned: false,
        });
      }
    }
  }

  // Fold previously-uploaded (draft) documents into the same analysis so the
  // verification status card still tells the user what's missing after a
  // Save-as-Draft → return round trip. Existing docs aren't in `selected`;
  // their type/side is encoded in `custom_type` (e.g. "Driver's License_front").
  for (const doc of existing) {
    const ct = doc.custom_type;
    if (!ct) continue;
    // Skip entries that carry no detected document type: the generic
    // "identification" fallback and legacy/manual label keys (primary_front, …).
    if (ct === "identification") continue;
    if (LABEL_OPTIONS.some((o) => o.value === ct)) continue;

    const match = /^(.*)_(front-and-back|front|back)(_unsigned)?$/i.exec(ct);
    const type = match ? match[1] : ct;
    const unsignedDraft = !!match?.[3];
    // No side suffix means the side was never established — detection returned
    // "unknown" (custom_type is written without a suffix in that case), or the
    // row predates side tracking. Reading that as "front-and-back" would let a
    // lone passport photo page re-hydrate as a complete ID and slip past the
    // both-sides check, so it stays unknown and the page is asked for again.
    const side = match ? match[2].toLowerCase() : "unknown";
    // Note for old drafts: a passport saved before both sides were required is
    // stored as "Canadian Passport_front" and now re-hydrates as INCOMPLETE, so
    // the client is asked for the reverse page when they return to the draft.
    //
    // Expiry isn't persisted on previously-uploaded docs, so we can't re-check
    // it here — treat as not-expired (the draft save already screened them).
    detectedDocs.push({ type, side, fileId: doc.id, expired: false, unsigned: unsignedDraft });
  }

  // Group by document type
  const docTypeGroups = detectedDocs.reduce<Record<string, typeof detectedDocs>>((acc, doc) => {
    const key = doc.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(doc);
    return acc;
  }, {});

  // Analyze each document type for side coverage
  const docAnalysis: { type: string; hasFront: boolean; hasBack: boolean; hasBothSides: boolean; complete: boolean; expired: boolean; unsigned: boolean }[] = [];
  for (const [type, docs] of Object.entries(docTypeGroups)) {
    const hasFront = docs.some(d => d.side === "front");
    const hasBack = docs.some(d => d.side === "back");
    const hasBothSides = docs.some(d => d.side === "front-and-back");
    // Completeness is decided HERE, from the sides actually present — the
    // detector's own `is_complete` is deliberately not consulted. The prompt asks
    // the model to require both sides, but a prompt is advice; this is the rule.
    // One image showing both sides counts, as does a separate front and back.
    const complete = hasBothSides || (hasFront && hasBack);
    // Unlike side-presence completeness, the signature check DOES consult the
    // detector's judgment — there's no way to tell a blank signature line
    // from a signed one just by knowing which sides were uploaded.
    const unsigned = docs.some(d => d.unsigned);
    // An expired ID is NOT a valid piece of ID — flag it so it doesn't count
    // toward the required two and so the UI can surface it.
    const expired = docs.some(d => d.expired);
    docAnalysis.push({ type, hasFront, hasBack, hasBothSides, complete, expired, unsigned });
  }

  // A document only counts as a VALID/verified ID when it has all required
  // sides, is signed, and is not expired. Expired/unsigned IDs are surfaced
  // as invalid below.
  const completeDocCount = docAnalysis.filter(d => d.complete && !d.expired && !d.unsigned).length;
  const incompleteDocCount = docAnalysis.filter(d => !(d.complete && !d.expired && !d.unsigned)).length;

  // Any recognised ID that is missing a side is a HARD BLOCK on submission, with
  // a message naming the document and the page still owed. This used to single
  // out driver's licences and passports — the two where a missing back is a
  // definite mistake — and let every other half-provided ID through on the
  // generic "finish the incomplete ID" warning. Nothing about the rule is
  // type-specific though: identity cannot be verified from one side of any of
  // them, so a stray half-ID is no longer uploadable alongside two good ones.
  // (Removing the file is still the way to submit without that document.)
  const incompleteIds = docAnalysis.filter((d) => !d.complete);
  const hasIncompleteIds = incompleteIds.length > 0;

  // "signature page", "back", "front", … — the page(s) still owed for an ID,
  // named per document type via secondSideLabel().
  function describeMissingSides(doc: { type: string; hasFront: boolean; hasBack: boolean }): string {
    const second = secondSideLabel(doc.type);
    if (!doc.hasFront && !doc.hasBack) return `front & ${second}`;
    return doc.hasFront ? second : "front";
  }

  // A file that fails detection, or comes back as "not identification", blocks
  // submission.
  //
  // There used to be an exception here: a file that looked like a passport back
  // (by filename or label) was waved through, because the back was not required
  // and the detector often could not recognise a plain signature page. Now that
  // the back IS required, waving it through would be the opposite of helpful —
  // it would let an unverified page stand in for a page the firm has to have. If
  // the detector cannot read a passport back, the user reclassifies it by hand.
  const hasDetectionFailures = selected.some((s) => {
    if (s.detectionError !== null) return true;
    if (s.detection !== null && !s.detection.isIdentification) return true;
    return false;
  });

  // Signature check: the detector can see both required sides of a passport
  // (or a credit card) and still mark it incomplete if the visible
  // signature page/strip is blank. Side presence alone (docAnalysis above)
  // doesn't catch this — it only looks at which sides were uploaded, not
  // whether they were signed — so it's checked separately here from the
  // detector's own per-document flag (see isUnsignedDoc). Previously-saved
  // draft documents are included via the "_unsigned" custom_type suffix.
  const unsignedDocs = selected.filter((s) => {
    const docs = s.detection?.multipleDocuments;
    if (!s.detection?.isIdentification || !docs) return false;
    return docs.some((d) => isUnsignedDoc(d));
  });
  const hasUnsignedDocs = unsignedDocs.length > 0 || docAnalysis.some((d) => d.unsigned);

  // Check for expired or expiring-soon IDs
  const expiredDocs = selected.filter(
    s => s.detection?.isIdentification && s.detection.expiryStatus === "expired"
  );
  const expiringSoonDocs = selected.filter(
    s => s.detection?.isIdentification && s.detection.expiryStatus === "expiring_soon"
  );
  const hasExpiredDocs = expiredDocs.length > 0;
  const hasExpiringSoonDocs = expiringSoonDocs.length > 0;

  const hasPendingDetection = selected.some(s => s.detecting);

  // Submission requires TWO fully-verified IDs (2/2) — counting any
  // previously-uploaded draft docs. Incomplete, expired or unverified IDs are
  // surfaced as warnings/details but do NOT count toward the required two and
  // therefore block submission until the user provides two valid pieces of ID.
  const canUpload =
    completeDocCount >= 2 &&
    !uploading &&
    !hasPendingDetection &&
    !hasIncompleteIds &&
    !hasExpiredDocs &&
    !hasUnsignedDocs;

  // Display-only flag for the verification card: are the submission
  // REQUIREMENTS met (ignoring transient uploading / pending-detection states)?
  const readyToSubmit =
    completeDocCount >= 2 && !hasIncompleteIds && !hasExpiredDocs && !hasUnsignedDocs;

  return (
    <>
      {/* Backdrop — owned by the shell in embedded mode */}
      {!embedded && (
        <div
          className={[
            "fixed inset-0 z-40 transition-opacity duration-300",
            isLargeScreen ? "bg-black/40 backdrop-blur-sm" : "bg-black/30",
            open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
          ].join(" ")}
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Modal (large screens) / Drawer (mobile) — embedded: a plain section */}
      <div
        className={
          embedded
            ? "bg-white flex flex-col"
            : [
                "fixed z-50 bg-white shadow-2xl flex flex-col",
                isLargeScreen
                  ? "inset-4 sm:inset-8 md:inset-12 lg:inset-16 xl:inset-20 max-w-5xl max-h-[90vh] mx-auto my-auto rounded-2xl border border-gray-100"
                  : "top-0 right-0 h-full w-full max-w-[540px]",
                isLargeScreen
                  ? open
                    ? "opacity-100 scale-100"
                    : "opacity-0 scale-95 pointer-events-none"
                  : open
                    ? "translate-x-0"
                    : "translate-x-full",
                isLargeScreen
                  ? "transition-all duration-200 ease-out"
                  : "transition-transform duration-300 ease-in-out",
              ].join(" ")
        }
        role={embedded ? undefined : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label={embedded ? undefined : "Upload Identification Documents"}
      >
        {/* Header — hidden in embedded mode (the shell renders the title) */}
        {!embedded && (
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-base font-bold text-gray-900 leading-snug">
              {spouseName
                ? `Upload Identification for ${spouseName}`
                : "Upload Identification Documents"}
            </h2>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              {spouseName
                ? `As your consenting spouse, ${spouseName} must provide two pieces of identification for the signing.`
                : "Upload your identification documents to verify your identity for the property transaction."}
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
        )}

        {/* Scrollable body */}
        <div
          className={
            embedded
              ? "px-4 py-4 space-y-6"
              : "flex-1 overflow-y-auto px-6 py-5 space-y-6"
          }
        >
          {/* Acceptable Documents Section - Always visible */}
          <AcceptableDocumentsSection />

          {/* Why is Identification Required - Collapsible */}
          <WhyIdentificationRequiredDropdown />

          {/* Take Photos with Camera Option */}
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
                <Camera size={18} className="text-[#C10007]" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">Have a camera?</p>
                <p className="text-xs text-gray-500">
                  Capture each ID with your camera — no need to save the photo first.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={openCameraFlow}
              disabled={uploading}
              className="flex-shrink-0"
            >
              <span className="inline-flex items-center gap-1.5">
                <Camera size={14} />
                Use Camera
              </span>
            </Button>
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
                            href={docDownloadHref(doc.file_url)}
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
                            {formatExistingDocLabel(doc.custom_type)}
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
                Uploaded Files ({selected.length})
              </h3>
              <ul className="space-y-2">
                {selected.map((s) => {
                  const hasError =
                    !!s.detectionError ||
                    (s.detection && !s.detection.isIdentification) ||
                    s.detection?.expiryStatus === "expired" ||
                    s.detection?.expiryStatus === "expiring_soon" ||
                    s.isDuplicate;
                  const isDetected = s.detection?.isIdentification && s.detection.documentType;
                  const showDuplicate = s.isDuplicate;
                  return (
                    <li
                      key={s.id}
                      className={[
                        "rounded-lg border bg-white",
                        hasError
                          ? "border-red-300"
                          : isDetected
                            ? "border-green-200"
                            : "border-gray-200",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {s.detecting ? (
                            <Loader2 size={14} className="animate-spin text-gray-400 flex-shrink-0" />
                          ) : hasError ? (
                            <AlertCircle size={14} className="text-[#C10007] flex-shrink-0" />
                          ) : s.detection?.isIdentification ? (
                            <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                          ) : (
                            <AlertCircle size={14} className="text-gray-400 flex-shrink-0" />
                          )}
                          <div className="w-10 h-10 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
                            {s.previewUrl ? (
                              <NextImage
                                src={s.previewUrl}
                                alt={s.file.name}
                                width={40}
                                height={40}
                                unoptimized
                                className="object-cover w-full h-full"
                              />
                            ) : (
                              <FileText size={16} className="text-gray-400" />
                            )}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800 truncate">{s.file.name}</p>
                          {isDetected ? (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              <p className={`text-[11px] font-medium truncate ${hasError ? "text-[#C10007]" : "text-green-600"}`}>
                                {s.detection!.documentType}
                                {/* An unsigned passport only cares about the
                                    signature, so it says that instead of the sides. */}
                                {s.detection!.multipleDocuments?.some(
                                  (d) => d.documentType === s.detection!.documentType && /passport/i.test(d.documentType) && isUnsignedDoc(d),
                                )
                                  ? " · signature missing"
                                  : s.detection!.side === "front-and-back"
                                    ? " · both sides in one image"
                                    : s.detection!.side !== "unknown"
                                      ? ` (${s.detection!.side})`
                                      : ""}
                              </p>
                              {showDuplicate && (
                                <div className="flex items-center gap-1 text-[10px] text-[#C10007] font-medium" title={s.duplicateReason ?? undefined}>
                                  <AlertCircle size={10} />
                                  <span>Duplicate file</span>
                                </div>
                              )}
                              {s.detection!.expiryStatus === "expired" && (
                                <div className="flex items-center gap-1 text-[10px] text-[#C10007] font-medium">
                                  <Clock size={10} />
                                  <span>Expired{s.detection!.expiryDate && ` (${s.detection!.expiryDate})`}</span>
                                </div>
                              )}
                              {s.detection!.expiryStatus === "expiring_soon" && (
                                <div className="flex items-center gap-1 text-[10px] text-[#C10007] font-medium">
                                  <Clock size={10} />
                                  <span>Expiring soon{s.detection!.expiryDate && ` (${s.detection!.expiryDate})`}</span>
                                </div>
                              )}
                            </div>
                          ) : s.uploading || s.detecting ? (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              <p className="text-[11px] text-gray-500">
                                {s.uploading
                                  ? `Uploading… (${formatBytes(s.file.size)})`
                                  : "Analyzing…"}
                              </p>
                            </div>
                          ) : s.detectionError ? (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              {/* Show the ACTUAL reason. This used to always read
                                  "Unable to process", which hid everything from an
                                  oversized-payload rejection to an expired session. */}
                              <p
                                className="text-[11px] font-medium text-[#C10007] truncate"
                                title={s.detectionError}
                              >
                                {s.detectionError}
                              </p>
                              {showDuplicate && (
                                <div className="flex items-center gap-1 text-[10px] text-[#C10007] font-medium" title={s.duplicateReason ?? undefined}>
                                  <AlertCircle size={10} />
                                  <span>Duplicate file</span>
                                </div>
                              )}
                            </div>
                          ) : s.detection && !s.detection.isIdentification ? (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              <p className="text-[11px] font-medium text-[#C10007]">Invalid ID</p>
                              {showDuplicate && (
                                <div className="flex items-center gap-1 text-[10px] text-[#C10007] font-medium" title={s.duplicateReason ?? undefined}>
                                  <AlertCircle size={10} />
                                  <span>Duplicate file</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              <p className="text-[11px] text-gray-400">{formatBytes(s.file.size)}</p>
                              {showDuplicate && (
                                <div className="flex items-center gap-1 text-[10px] text-[#C10007] font-medium" title={s.duplicateReason ?? undefined}>
                                  <AlertCircle size={10} />
                                  <span>Duplicate file</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Reclassify button - opens modal */}
                        <button
                          onClick={() => openManualClassify(s.id, s.file.name)}
                          className="cursor-pointer flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-200 hover:border-gray-300 hover:bg-gray-100 transition-colors"
                          aria-label="Reclassify document"
                        >
                          Reclassify
                        </button>
                        <button
                          onClick={() => removeSelected(s.id)}
                          className="cursor-pointer flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:text-[#C10007] hover:bg-red-50"
                          aria-label="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#C10007] hover:underline cursor-pointer"
              >
                <Plus size={12} />
                Add more files
              </button>
            </div>
          )}

          {/* Detection errors callout */}
          {selected.length > 0 && !hasPendingDetection && hasDetectionFailures && (
            <div className="flex items-start gap-2 text-xs text-[#C10007] bg-[#FEF2F2] border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle size={13} strokeWidth={2} className="flex-shrink-0 mt-0.5 text-[#C10007]" />
              <span>
                Some files couldn&rsquo;t be identified as valid government IDs. You can still submit, but please double-check these documents.
              </span>
            </div>
          )}

          {/* Expiring soon warning */}
          {selected.length > 0 && !hasPendingDetection && !hasExpiredDocs && hasExpiringSoonDocs && (
            <div className="flex items-start gap-2 text-xs text-[#C10007] bg-[#FEF2F2] border border-red-200 rounded-lg px-3 py-2.5">
              <Clock size={13} strokeWidth={2} className="flex-shrink-0 mt-0.5 text-[#C10007]" />
              <div>
                <span className="font-semibold">ID expiring soon.</span>{" "}
                <span>
                  {expiringSoonDocs.length === 1
                    ? `Your ${expiringSoonDocs[0].detection?.documentType} will expire within 30 days. Consider using a different ID if your closing is after that date.`
                    : `${expiringSoonDocs.length} of your IDs will expire within 30 days. Consider using different IDs if your closing is after those dates.`}
                </span>
              </div>
            </div>
          )}

          {/* Global error */}
          {globalError && (
            <div className="flex items-start gap-2 text-xs text-[#C10007] bg-[#FEF2F2] border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle size={13} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
              <span>{globalError}</span>
            </div>
          )}

          {/* Draft saved success indicator */}
          {draftSaved && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
              <CheckCircle2 size={14} strokeWidth={2.5} className="flex-shrink-0" />
              <span className="font-semibold">Draft saved! You can come back later to finish.</span>
            </div>
          )}
        </div>

        {/* Verification status — pinned just above the footer so the user
            always sees what's missing / whether they can submit, without having
            to scroll to the bottom of the document list. */}
        {(selected.length > 0 || existing.length > 0) && !hasPendingDetection && (
          <div className="px-6 pt-4 border-t border-gray-100 max-h-[38vh] overflow-y-auto">
            <div
              ref={verificationStatusRef}
              className={[
                "rounded-xl border overflow-hidden bg-white",
                readyToSubmit
                  ? "border-green-200"
                  : "border-red-300 border-t-4 border-t-[#C10007]",
              ].join(" ")}
            >
              {/* Status Header */}
              <div className={[
                "px-4 py-3 flex items-center gap-3",
                readyToSubmit ? "bg-green-50 border-b border-green-100" : "bg-white",
              ].join(" ")}>
                {readyToSubmit ? (
                  <>
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 size={18} className="text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-green-800">Ready to Submit</p>
                      <p className="text-xs text-green-700">
                        {completeDocCount} government IDs verified
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-full bg-[#C10007] flex items-center justify-center flex-shrink-0">
                      <AlertCircle size={18} className="text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {hasExpiredDocs
                          ? "Expired ID — action needed"
                          : hasUnsignedDocs
                            ? "Signature Missing"
                            : hasIncompleteIds
                              ? incompleteIds.length === 1
                                ? `${incompleteIds[0].type} — ${describeMissingSides(incompleteIds[0])} required`
                                : "Both Sides of Every ID Required"
                              : completeDocCount === 0
                                ? "2 Valid Government IDs Required"
                                : "1 More Valid Government ID Required"}
                      </p>
                      <p className="text-xs text-gray-900">
                        {hasExpiredDocs
                          ? "An uploaded ID is expired — see details below"
                          : hasUnsignedDocs
                            ? "The signature page is visible but unsigned — see details below"
                            : `${completeDocCount}/2 verified — see details below`}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Document Details — always white background below header */}
              {docAnalysis.length > 0 && (
                <div className="px-4 py-3 bg-white border-t border-gray-100 space-y-2">
                  {docAnalysis.map((doc, idx) => {
                    const valid = doc.complete && !doc.expired && !doc.unsigned;
                    return (
                      <div key={idx} className="flex items-start gap-2.5 text-xs">
                        {valid ? (
                          <CheckCircle2 size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle size={14} className="text-[#C10007] flex-shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1 text-gray-900">
                          <span className="font-semibold">{doc.type}</span>
                          <span className={doc.expired ? "text-[#C10007] font-semibold" : ""}>
                            {doc.expired
                              ? " — expired (not a valid ID)"
                              : doc.unsigned
                                ? " — signature missing"
                                : doc.complete
                                  ? doc.hasBothSides
                                    ? " — both sides in one image"
                                    : " — both sides verified"
                                  : ` — missing ${describeMissingSides(doc)}`
                            }
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action hint while submission is blocked. Nothing is shown for a
                  half-provided ID: the header and the per-document line above
                  already name the page still owed, and the submit button repeats
                  it — a paragraph here just said the same thing a third time. */}
              {!readyToSubmit && (hasExpiredDocs || !hasIncompleteIds) && (
                <div className="px-4 py-2.5 bg-white border-t border-gray-100">
                  <p className="text-xs text-[#C10007] font-semibold">
                    {hasExpiredDocs
                      ? "Remove or replace the expired ID — expired documents are not accepted."
                      : completeDocCount === 0
                        ? "Add two valid government IDs to submit (2/2) — upload both sides of each ID. Passports need the photo page and the signature page."
                        : incompleteDocCount > 0
                          ? "Finish the incomplete ID (upload its missing side) or add another valid ID — you need two verified IDs (2/2) to submit."
                          : "Add one more valid government ID to submit — two verified IDs (2/2) are required."
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={handleSaveDraft}
            disabled={uploading || hasPendingDetection}
            loading={savingDraft}
            className="sm:flex-1"
          >
            Save as Draft
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={!canUpload || savingDraft}
            loading={uploading}
            onClick={handleUploadClick}
            className="sm:flex-1"
          >
            Submit
          </Button>
        </div>
      </div>

      {/* Simplified error modal */}
      {errorModal.open && (
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
              {/* Icon */}
              <div className="flex justify-center pt-8 pb-4">
                <div className="w-14 h-14 rounded-full bg-[#FEF2F2] flex items-center justify-center">
                  <AlertCircle size={28} className="text-[#C10007]" strokeWidth={1.75} />
                </div>
              </div>

              {/* Title and reason */}
              <div className="px-6 pb-6 text-center space-y-3">
                <h3 className="text-base font-bold text-gray-900">
                  {getErrorModalTitle(errorModal.kind)}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {getErrorModalMessage(
                    errorModal.kind,
                    errorModal.documentType,
                    errorModal.expiryDate,
                    errorModal.customReason
                  )}
                </p>
              </div>

              {/* Single OK button */}
              <div className="px-6 pb-6">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={closeErrorModal}
                >
                  OK
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Manual classification modal */}
      {manualClassifyModal.open && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/40"
            aria-hidden="true"
          />
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center px-5"
            role="dialog"
            aria-modal="true"
            aria-label="Manually classify document"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
              {/* Header */}
              <div className="px-6 pt-6 pb-4 relative">
                <button
                  onClick={() =>
                    setManualClassifyModal({ open: false, fileId: "", fileName: "", selectedType: "", selectedSide: "front" })
                  }
                  className="absolute top-4 right-4 cursor-pointer rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-3 mb-3 pr-8">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                    <FileText size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Classify Document</h3>
                    <p className="text-xs text-gray-500 truncate max-w-[200px]">
                      {manualClassifyModal.fileName}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Select the document type and which side is shown in this image.
                </p>
              </div>

              {/* Form */}
              <div className="px-6 pb-4 space-y-4">
                {/* Document Type */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Document Type <span className="text-[#C10007]">*</span>
                  </label>
                  <select
                    value={manualClassifyModal.selectedType}
                    onChange={(e) =>
                      setManualClassifyModal((prev) => ({
                        ...prev,
                        selectedType: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C10007]/20 focus:border-[#C10007] cursor-pointer"
                  >
                    <option value="">Select document type...</option>
                    {ACCEPTABLE_ID_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Side Selection — shown for every ID type. Passports used to be
                    excluded here and pinned to "front"; now that their reverse
                    page is required, the user must be able to say which side
                    this file shows. */}
                {manualClassifyModal.selectedType && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Side Shown <span className="text-[#C10007]">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["front", "back", "front-and-back"] as ManualSide[]).map((side) => (
                        <button
                          key={side}
                          type="button"
                          onClick={() =>
                            setManualClassifyModal((prev) => ({ ...prev, selectedSide: side }))
                          }
                          className={[
                            "px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer",
                            manualClassifyModal.selectedSide === side
                              ? "border-[#C10007] bg-[#FEF2F2] text-[#C10007]"
                              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                          ].join(" ")}
                        >
                          {side === "front-and-back" ? "Both Sides" : side.charAt(0).toUpperCase() + side.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Passport-specific guidance: "back" is less obvious on a
                    booklet than on a card, so name what we mean. */}
                {manualClassifyModal.selectedType.toLowerCase().includes("passport") && (
                  <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
                    <ShieldCheck size={14} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Passports need both sides: the photo/info page (front) and the
                      signature page — upload that one as the &ldquo;back&rdquo;, not the blank
                      rear cover.
                    </span>
                  </div>
                )}

                {/* Credit-card guidance: the signature strip on the back is the
                    part that makes the card usable as ID. */}
                {manualClassifyModal.selectedType.toLowerCase().includes("credit card") && (
                  <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
                    <ShieldCheck size={14} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Credit cards need both sides, and the back must show your handwritten
                      signature on the signature strip. A statement or a photo of the card number
                      on paper cannot be used.
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-6 pb-6">
                <Button
                  variant="primary"
                  fullWidth
                  disabled={!manualClassifyModal.selectedType}
                  onClick={applyManualClassification}
                >
                  Update
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Confirmation modal before submission */}
      {showConfirmModal && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/40"
            onClick={() => !uploading && !cameraSubmitting && setShowConfirmModal(false)}
            aria-hidden="true"
          />
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center px-5"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm submission"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
              {/* Warning banner */}
              <div className="bg-[#FEF2F2] border-b border-red-200 px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <AlertCircle size={20} className="text-[#C10007]" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#C10007]">
                      ID cannot be changed after submission.
                    </p>
                    <p className="text-sm text-[#C10007]/90 mt-1 leading-relaxed">
                      Please ensure it is accurate before submitting — otherwise you&apos;ll have to contact a law clerk to change the info.
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 py-4 flex flex-col gap-2.5">
                <Button
                  variant="primary"
                  fullWidth
                  loading={uploading}
                  onClick={() => {
                    setShowConfirmModal(false);
                    handleUpload();
                  }}
                >
                  Confirm Submission
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={uploading}
                  onClick={() => setShowConfirmModal(false)}
                >
                  Cancel
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
                  {cameraStepIndex < cameraSteps.length ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Step {cameraStepIndex + 1} of {cameraSteps.length}:{" "}
                      {SLOT_LABELS[currentCameraSlot as SlotKey]}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">
                      {cameraSteps.length === ALL_CAMERA_STEPS.length
                        ? "Review all captured images, then click Finish."
                        : "Review your captured image, then click Finish."}
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
                {cameraStepIndex < cameraSteps.length ? (
                  !currentCapture ? (
                    <>
                      <div className="relative mx-auto w-full max-w-sm aspect-square overflow-hidden rounded-xl bg-gray-950">
                        <Webcam
                          ref={webcamRef}
                          audio={false}
                          screenshotFormat="image/jpeg"
                          screenshotQuality={0.95}
                          // Capture at the CAMERA's resolution, not the preview box's. Without
                          // forceScreenshotSourceSize react-webcam sizes its screenshot canvas to
                          // the video element's clientWidth, so an ID was stored a few hundred
                          // pixels wide and its fine print was gone before the file ever left the
                          // browser. `ideal` degrades on its own where 1920 isn't available.
                          forceScreenshotSourceSize
                          videoConstraints={{ facingMode: "environment", width: { ideal: 1920 } }}
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
                        {sharpnessScore !== null && sharpnessOk && (
                          <p className="text-[11px] mt-2 text-green-600">
                            Image looks good!
                          </p>
                        )}
                      </div>
                    </>
                  )
                ) : (
                  <div className="space-y-3">
                    <div className={`grid gap-2 sm:gap-3 ${cameraSteps.length <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
                      {cameraSteps.map((key) => (
                        <div key={key} className="rounded-xl border border-gray-200 bg-gray-50 p-2 sm:p-2.5">
                          <p className="text-[10px] sm:text-xs font-semibold text-gray-700 mb-1.5 truncate">{SLOT_LABELS[key]}</p>
                          {cameraCapturedPreview[key] ? (
                            <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-gray-200">
                              <NextImage
                                src={cameraCapturedPreview[key] as string}
                                alt={`${SLOT_LABELS[key]} preview`}
                                fill
                                unoptimized
                                className="object-cover"
                              />
                            </div>
                          ) : (
                            <div className="aspect-[3/4] rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center text-[10px] sm:text-xs text-gray-400 text-center px-1">
                              Not captured
                            </div>
                          )}
                          <button
                            onClick={() => retakeSingleSlot(key)}
                            className="mt-1.5 cursor-pointer text-[10px] sm:text-xs font-semibold text-[#C10007] hover:underline"
                          >
                            Retake
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                      Captured {cameraCapturedCount} of {cameraSteps.length} required photos.
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
                {cameraStepIndex < cameraSteps.length ? (
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
                          {cameraStepIndex < cameraSteps.length - 1
                            ? "Use & Next Step"
                            : cameraSteps.length === 1
                              ? "Use & Review"
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
                      onClick={() => openCameraStep(cameraSteps[0])}
                      className="sm:flex-1"
                    >
                      Capture Again
                    </Button>
                    <Button
                      variant="primary"
                      fullWidth
                      disabled={!cameraFlowReadyToSubmit}
                      onClick={handleFinishCameraFlowClick}
                      className="sm:flex-1"
                    >
                      Add to Review
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
