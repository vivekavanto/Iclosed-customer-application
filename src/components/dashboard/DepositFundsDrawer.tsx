"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { FileText, Loader2, Upload, X, ExternalLink } from "lucide-react";
import { BLOB_ACCESS, docDownloadHref } from "@/lib/blobPrivacy";
import { DEPOSIT_TASK_DESCRIPTION, FUNDS_TRANSFER } from "@/lib/depositTask";

/**
 * "Deposit Funds Into Our Trust Account" — the purchaser's last task.
 *
 * It gets its own drawer rather than going through DynamicTaskDrawer because
 * the upload is the smallest part of it. What the client actually needs is the
 * amount, the statement it came from, and three ways to send the money — and
 * those have to be readable before they pick a file, not after.
 *
 * The balance and the statement come from the back office (an admin uploads the
 * Final Statement of Account and enters the figure, which is what makes this
 * task appear at all). The transfer instructions are constants in
 * src/lib/depositTask.ts, mirrored from the admin repo.
 *
 * Submission is the standard path — blob upload, save-doc-metadata, then
 * /api/task-responses — so the response, the document and the completion all
 * land exactly where every other task's do.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png";

interface FormField {
  id: string;
  label: string;
  field_type: string;
  required?: boolean;
}

interface DepositFundsDrawerProps {
  open: boolean;
  onClose: () => void;
  taskId: string | null;
  taskTitle: string;
  leadId: string | null;
  onTaskCompleted?: (taskId: string) => void;
}

/** "$487,652.18" — the figure is the point of this screen, so never "NaN". */
function formatCurrency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function DepositFundsDrawer({
  open,
  onClose,
  taskId,
  taskTitle,
  leadId,
  onTaskCompleted,
}: DepositFundsDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [balanceDue, setBalanceDue] = useState<number | null>(null);
  const [statement, setStatement] = useState<{
    file_name: string | null;
    file_url: string | null;
  } | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      const [depositRes, fieldsRes] = await Promise.all([
        fetch(`/api/deposit-task?task_id=${taskId}`),
        fetch(`/api/task-form-fields?task_id=${taskId}`),
      ]);
      const deposit = await depositRes.json();
      const fieldData = await fieldsRes.json();

      if (deposit?.success) {
        setBalanceDue(
          deposit.balance_due === null || deposit.balance_due === undefined
            ? null
            : Number(deposit.balance_due),
        );
        setStatement(deposit.statement ?? null);
      }
      if (fieldData?.success) setFields(fieldData.fields ?? []);
    } catch {
      setError("Could not load your deposit details. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setSaved(false);
    setError(null);
    void load();
  }, [open, load]);

  const handleFilePick = (picked: File | null) => {
    if (!picked) return;
    if (picked.size > MAX_BYTES) {
      setError("That file is larger than 10MB. Please upload a smaller file.");
      return;
    }
    setError(null);
    setFile(picked);
  };

  const handleSubmit = async () => {
    if (!taskId) return;
    // Mandatory: there is nothing else on this task, so without the proof there
    // is nothing to submit.
    if (!file) {
      setError("Please upload your proof of deposit to complete this task.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const safeLeadId = leadId ?? "unknown";
      // Direct browser → Vercel Blob upload: a 10MB scan would exceed the
      // ~4.5MB serverless request-body cap going through the function.
      const blob = await upload(
        `corporate-docs/${safeLeadId}/${Date.now()}-${file.name}`,
        file,
        {
          access: BLOB_ACCESS,
          handleUploadUrl: "/api/blob/upload",
          clientPayload: JSON.stringify({
            lead_id: safeLeadId,
            doc_type: "proof_of_deposit",
          }),
        },
      );

      const metaRes = await fetch("/api/blob/save-doc-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: safeLeadId,
          doc_type: "proof_of_deposit",
          file_name: file.name,
          file_url: blob.url,
        }),
      });
      const metaData = await metaRes.json();
      if (!metaData.success) throw new Error(metaData.error ?? "Upload failed.");

      // The seeded field is the one file slot on this template; fall back to a
      // label-only response if the template row is missing, so a client is never
      // blocked from submitting by a configuration gap.
      const field =
        fields.find((f) => f.field_type === "file") ??
        ({ id: "", label: "Upload Proof of Deposit", field_type: "file" } as FormField);

      const res = await fetch("/api/task-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          responses: [
            {
              ...(field.id ? { field_id: field.id } : {}),
              field_label: field.label,
              field_type: "file",
              file_url: blob.url,
              file_name: file.name,
            },
          ],
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error ?? "Could not submit your deposit.");

      setSaved(true);
      onTaskCompleted?.(taskId);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={saving ? undefined : onClose}
        aria-hidden="true"
      />

      <div
        className="fixed z-50 inset-0 sm:inset-8 lg:inset-12 max-w-5xl max-h-[92vh] mx-auto my-auto bg-white shadow-2xl flex flex-col sm:rounded-2xl border border-gray-100"
        role="dialog"
        aria-modal="true"
        aria-label={taskTitle}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-base font-bold text-gray-900 leading-snug">{taskTitle}</h2>
            <p className="text-xs text-gray-400 mt-1">
              Review the instructions below, send your funds, then upload your proof of deposit.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="cursor-pointer flex-shrink-0 rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <p className="text-sm text-gray-600 leading-relaxed">{DEPOSIT_TASK_DESCRIPTION}</p>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your deposit details…
            </div>
          ) : (
            <>
              {/* ── Balance due + the statement it came from ── */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50/70 px-6 py-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    Balance due on closing
                  </p>
                  <p className="text-3xl sm:text-4xl font-bold text-gray-900 mt-1 tabular-nums">
                    {formatCurrency(balanceDue)}
                  </p>
                </div>
                {statement?.file_url && (
                  <a
                    href={docDownloadHref(statement.file_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 border-t border-gray-200 px-6 py-4 hover:bg-gray-50 transition-colors group"
                  >
                    <span className="shrink-0 w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-[#C10007]" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-[#C10007]">
                        View your Final Statement of Account
                      </span>
                      <span className="block text-xs text-gray-500">
                        PDF · Full breakdown of how this amount was calculated
                      </span>
                    </span>
                    <ExternalLink className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </a>
                )}
              </div>

              {/* ── How to send the money ── */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <p className="text-sm font-bold text-gray-900">Funds Transfer Instructions</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Three ways to send us funds. In all cases, upload your proof of transfer below
                    once completed.
                  </p>
                </div>
                <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                  {FUNDS_TRANSFER.map((option, i) => (
                    <div key={option.title} className="px-6 py-5 flex flex-col">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-red-50 text-[#C10007] text-[11px] font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <p className="text-sm font-bold text-gray-900">{option.title}</p>
                      </div>

                      {option.intro && (
                        <p className="text-sm text-gray-700 leading-relaxed mb-2">{option.intro}</p>
                      )}

                      {option.bullets && (
                        <ul className="space-y-1.5 mb-3">
                          {option.bullets.map((b) => (
                            <li key={b} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
                              <span className="text-gray-300 mt-1.5 shrink-0 w-1 h-1 rounded-full bg-gray-300" />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {option.rows && (
                        <dl className="space-y-2.5">
                          {option.rows.map((row) => (
                            <div key={row.label}>
                              <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                                {row.label}
                              </dt>
                              {row.lines.map((line) => (
                                <dd key={line} className="text-sm text-gray-700 leading-snug">
                                  {line}
                                </dd>
                              ))}
                            </div>
                          ))}
                        </dl>
                      )}

                      <p className="text-sm font-bold text-[#C10007] mt-auto pt-4">
                        {option.deadline}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── The one thing the client submits ── */}
              <div>
                <p className="text-sm font-bold text-gray-900 mb-2">
                  Upload Proof of Deposit <span className="text-[#C10007]">*</span>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const picked = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    handleFilePick(picked);
                  }}
                />
                {file ? (
                  <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-4">
                    <span className="shrink-0 w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-[#C10007]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {Math.max(1, Math.round(file.size / 1024))} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={saving}
                      className="shrink-0 text-sm font-semibold text-[#C10007] hover:underline disabled:opacity-50"
                    >
                      Replace
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 rounded-xl px-6 py-10 flex flex-col items-center gap-3 hover:border-[#C10007] hover:bg-gray-50/60 transition-colors"
                  >
                    <span className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center">
                      <Upload className="h-4 w-4 text-gray-500" />
                    </span>
                    <span className="text-sm font-bold text-gray-900">Upload proof of deposit</span>
                    <span className="text-xs text-gray-500">
                      Click or drag · {ACCEPT} · Max 10MB
                    </span>
                  </button>
                )}
              </div>

              {error && <p className="text-sm font-medium text-[#C10007]">{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-gray-300 px-6 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || saved || loading}
            className="flex-1 rounded-lg bg-[#C10007] px-6 py-3 text-sm font-bold text-white hover:bg-[#a30006] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saved ? "Submitted" : saving ? "Uploading…" : "Upload & Submit"}
          </button>
        </div>
      </div>
    </>
  );
}
