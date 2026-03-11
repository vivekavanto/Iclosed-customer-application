"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Upload, FileText, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import Button from "@/components/ui/Button";

interface UploadAgreementDrawerProps {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  taskId?: string;
  onSaved?: () => void;
}

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function validateFile(f: File): string | null {
  const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return "Only PDF, DOC, and DOCX files are allowed.";
  }
  if (f.size > MAX_SIZE) {
    return "File size must not exceed 10 MB.";
  }
  return null;
}

export default function UploadAgreementDrawer({
  open,
  onClose,
  leadId,
  taskId,
  onSaved,
}: UploadAgreementDrawerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  function handlePickFile(f: File) {
    const err = validateFile(f);
    if (err) {
      setError(err);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
    setUploaded(false);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handlePickFile(f);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handlePickFile(f);
    e.target.value = "";
  }

  function handleDelete() {
    setFile(null);
    setError(null);
    setUploaded(false);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("lead_id", leadId ?? "unknown");
      fd.append("doc_type", "aps");
      const res = await fetch("/api/uploadblobstorage", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Upload failed");
      
      const fileUrl = data.url ?? data.file_url;
      
      // If we have a taskId, record the response in the DB to mark task as done
      if (taskId) {
        const respRes = await fetch("/api/task-responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task_id: taskId,
            responses: [{
              field_label: "Agreement of Purchase and Sale",
              field_type: "file",
              file_url: fileUrl,
              file_name: file.name
            }]
          })
        });
        if (!respRes.ok) throw new Error("File uploaded, but failed to mark task as completed.");
        
        if (onSaved) onSaved();
      }

      setUploaded(true);
    } catch (err: any) {
      setError(err.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleClose() {
    setFile(null);
    setError(null);
    setUploaded(false);
    setIsDragging(false);
    onClose();
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
          "fixed top-0 right-0 z-50 h-full w-full max-w-[480px] bg-white shadow-2xl",
          "flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label="Upload Agreement of Purchase and Sale"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-base font-bold text-gray-900 leading-snug">
              Upload Agreement of Purchase and Sale
            </h2>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Upload your complete Agreement of Purchase and Sale along with any amendments and waivers.
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

          {/* Upload Section */}
          <div>
            {/* Section label */}
            <div className="flex items-center gap-2 mb-1">
              <FileText size={15} className="text-[#C10007]" strokeWidth={2} />
              <p className="text-sm font-semibold text-gray-800">
                Agreement of Purchase and Sale{" "}
                <span className="text-[#C10007]">*</span>
              </p>
            </div>
            <p className="text-xs text-gray-400 mb-3 ml-[23px]">Upload Main Agreement</p>

            {/* Drop zone — shown when no file is selected */}
            {!file && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
                className={[
                  "border-2 border-dashed rounded-xl p-8 sm:p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200 select-none",
                  isDragging
                    ? "border-[#C10007] bg-[#FEF2F2]"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                ].join(" ")}
              >
                <div className={[
                  "w-11 h-11 rounded-full flex items-center justify-center transition-colors duration-200",
                  isDragging ? "bg-[#FEF2F2]" : "bg-gray-100",
                ].join(" ")}>
                  <Upload
                    size={20}
                    className={isDragging ? "text-[#C10007]" : "text-gray-400"}
                    strokeWidth={2}
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX (Max 10MB)</p>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>
            )}

            {/* Uploaded file card — shown after file is chosen */}
            {file && (
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
                <div className="w-10 h-10 rounded-lg bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
                  <FileText size={17} className="text-[#C10007]" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatBytes(file.size)}</p>
                </div>
                {uploaded && (
                  <CheckCircle2
                    size={17}
                    className="text-green-500 flex-shrink-0"
                    strokeWidth={2}
                  />
                )}
                <button
                  onClick={handleDelete}
                  className="cursor-pointer flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-[#C10007] hover:border-red-200 hover:bg-red-50 transition-colors"
                  title="Delete"
                  aria-label="Remove file"
                >
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </div>
            )}

            {/* Validation error */}
            {error && (
              <div className="flex items-center gap-2 mt-2.5 text-xs text-[#C10007]">
                <AlertCircle size={13} strokeWidth={2} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Important Note */}
          <div className="rounded-xl border border-red-200 bg-[#FEF2F2] px-4 py-4">
            <div className="flex items-start gap-2.5">
              <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-[#C10007] flex items-center justify-center">
                <AlertCircle size={12} className="text-white" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 mb-1.5">Important Note</p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Please ensure the Agreement of Purchase and Sale document is complete and signed by all parties before uploading.
                </p>
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  Amendments and waivers upload functionality will be available soon.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="px-6 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={handleClose}
            className="sm:flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={!file || uploading || uploaded}
            loading={uploading}
            onClick={handleUpload}
            className="sm:flex-1"
          >
            {uploaded ? "Agreement Uploaded" : "Upload Agreement"}
          </Button>
        </div>
      </div>
    </>
  );
}
