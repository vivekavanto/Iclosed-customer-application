"use client";

import { useEffect, useState } from "react";
import { Building2, Download, Eye, FileText, Loader2, Users } from "lucide-react";
import { docDownloadHref, docFetchCredentials } from "@/lib/blobPrivacy";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Doc {
  id: string;
  lead_id: string;
  label: string;
  file_name: string | null;
  file_url: string;
  file_size: number | null;
  created_at: string | null;
}

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

      <div className="flex shrink-0 items-center gap-1">
        <a
          href={docDownloadHref(doc.file_url)}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer rounded-sm p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#1a1a1a] border border-gray-300"
          title="View"
        >
          <Eye className="h-4 w-4" />
        </a>
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
    </div>
  );
}

function DocSection({
  icon,
  title,
  docs,
  emptyText,
}: {
  icon: React.ReactNode;
  title: string;
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
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [otherDocuments, setOtherDocuments] = useState<Doc[]>([]);
  const [downloadingAll, setDownloadingAll] = useState(false);

  useEffect(() => {
    fetch("/api/documents")
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.error || "Could not load documents");
        setDocuments(data.documents ?? []);
        setOtherDocuments(data.otherDocuments ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load documents"))
      .finally(() => setLoading(false));
  }, []);

  const allDocs = [...documents, ...otherDocuments];

  const handleDownloadAll = async () => {
    setDownloadingAll(true);
    try {
      const res = await fetch("/api/documents/package");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "iclosed-documents.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("[documents] download-all failed:", err);
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <div className="space-y-10">
      {allDocs.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloadingAll}
            className="inline-flex items-center gap-2 rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-[#1a1a1a] shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {downloadingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download All
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <p className="text-sm text-[#C10007]">{error}</p>
      ) : allDocs.length === 0 ? (
        <p className="text-sm text-gray-400">No documents have been uploaded yet.</p>
      ) : (
        <div className="space-y-10">
          <DocSection
            icon={<Users className="h-4 w-4" />}
            title="Your Documents"
            docs={documents}
            emptyText="No documents have been uploaded yet."
          />
          <DocSection
            icon={<Building2 className="h-4 w-4" />}
            title="Documents from iClosed"
            docs={otherDocuments}
            emptyText="No documents from iClosed yet."
          />
        </div>
      )}
    </div>
  );
}
