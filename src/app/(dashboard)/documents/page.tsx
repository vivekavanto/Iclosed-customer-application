"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Users } from "lucide-react";
import { docDownloadHref, docFetchCredentials } from "@/lib/blobPrivacy";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Party {
  lead_id: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface Doc {
  id: string;
  lead_id: string;
  label: string;
  file_name: string | null;
  file_url: string;
  file_size: number | null;
  created_at: string | null;
}

const roleLabel: Record<string, string> = {
  primary: "You",
  purchaser: "Co-Purchaser",
  seller: "Co-Seller",
  applicant: "Applicant",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function CountBadge({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
      {n}
    </span>
  );
}

// Saves via a blob: URL so it always downloads instead of opening inline.
async function forceDownload(doc: Doc) {
  const res = await fetch(docDownloadHref(doc.file_url), {
    credentials: docFetchCredentials(doc.file_url),
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = doc.file_name || doc.label;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function DocCard({ doc }: { doc: Doc }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await forceDownload(doc);
    } catch (err) {
      console.error("[documents] download failed:", err);
      // Fallback: open in a new tab instead of a silent dead button.
      window.open(docDownloadHref(doc.file_url), "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-gray-200 hover:shadow-md">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#C10007]/10">
        <FileText className="h-5 w-5 text-[#C10007]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#1a1a1a]">
          <span className="ph-mask">{doc.label}</span>
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          Uploaded {formatDate(doc.created_at)}
          {doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ""}
        </p>
      </div>

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="cursor-pointer rounded-sm p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#1a1a1a] border border-gray-300 disabled:opacity-50"
        title="Download"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

function DocSection({
  icon,
  title,
  subtitle,
  docs,
  emptyText,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  docs: Doc[];
  emptyText: string;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-gray-50 text-gray-400">
          {icon}
        </div>
        <h2 className="text-base font-bold text-[#1a1a1a]">{title}</h2>
        {subtitle && <span className="text-sm font-normal text-gray-400">{subtitle}</span>}
        <CountBadge n={docs.length} />
      </div>
      {docs.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {docs.map((doc) => (
            <DocCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [otherDocuments, setOtherDocuments] = useState<Doc[]>([]);

  useEffect(() => {
    fetch("/api/documents")
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.error || "Could not load documents");
        setParties(data.parties ?? []);
        setDocuments(data.documents ?? []);
        setOtherDocuments(data.otherDocuments ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load documents"))
      .finally(() => setLoading(false));
  }, []);

  const docsByLead = documents.reduce<Record<string, Doc[]>>((acc, doc) => {
    (acc[doc.lead_id] ??= []).push(doc);
    return acc;
  }, {});

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1a1a1a]">
          Shared Documents
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Every document uploaded for your file, in one place
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <p className="text-sm text-[#C10007]">{error}</p>
      ) : documents.length === 0 && otherDocuments.length === 0 ? (
        <p className="text-sm text-gray-400">No documents have been uploaded yet.</p>
      ) : (
        <div className="space-y-10">
          {parties.length > 1 ? (
            // Multiple parties on the file — divide person-specific documents.
            parties.map((party) => (
              <DocSection
                key={party.lead_id}
                icon={<Users className="h-4 w-4" />}
                title={`${party.first_name} ${party.last_name}`.trim() || "Unnamed Party"}
                subtitle={roleLabel[party.role] ?? party.role}
                docs={docsByLead[party.lead_id] ?? []}
                emptyText="No documents yet."
              />
            ))
          ) : (
            <DocSection
              icon={<FileText className="h-4 w-4" />}
              title="Uploaded Documents"
              docs={documents}
              emptyText="No documents have been uploaded yet."
            />
          )}

          {/* Deal-level, not per-party — shown once, on its own. */}
          {otherDocuments.length > 0 && (
            <DocSection
              icon={<FileText className="h-4 w-4" />}
              title="Other Documents"
              docs={otherDocuments}
              emptyText=""
            />
          )}
        </div>
      )}
    </div>
  );
}
