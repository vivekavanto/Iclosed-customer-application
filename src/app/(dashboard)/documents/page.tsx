"use client";

import { useState } from "react";
import {
  History,
  Pencil,
  Trash2,
  Upload,
  Plus,
  ChevronRight,
  FileText,
  Users,
} from "lucide-react";
import DocumentHistoryPopup from "@/components/documents/popup";

// ─── Types ────────────────────────────────────────────────────────────────────
type Ext = "pdf" | "jpg" | "png";

// ─── Static data ──────────────────────────────────────────────────────────────
const docs = [
  {
    id: 1,
    name: "Agreement of Purchase and Sale (APS).pdf",
    ext: "pdf" as Ext,
    date: "March 20, 2025 at 10:42 AM EST",
  },
  {
    id: 2,
    name: "Mortgage Approval Letter.pdf",
    ext: "pdf" as Ext,
    date: "March 28, 2025, at 5:00 PM",
  },
  {
    id: 3,
    name: "Proof of Address (Utility Bill).jpg",
    ext: "jpg" as Ext,
    date: "March 28, 2025, at 5:00 PM",
  },
  {
    id: 4,
    name: "ID Verification – Front (Driver's License).png",
    ext: "png" as Ext,
    date: "March 28, 2025, at 5:00 PM",
  },
  {
    id: 5,
    name: "ID Verification – Back (Driver's License).png",
    ext: "png" as Ext,
    date: "March 28, 2025, at 5:00 PM",
  },
  {
    id: 6,
    name: "Co-Purchaser Authorization Form.pdf",
    ext: "pdf" as Ext,
    date: "March 28, 2025, at 5:00 PM",
  },
];

const partners = [
  {
    id: 1,
    name: "John Doe",
    badge: "(You)",
    role: "Purchaser",
    initials: "JD",
    color: "#C10007",
  },
  {
    id: 2,
    name: "Jessica Martin",
    badge: "",
    role: "Real Estate Agent",
    initials: "JM",
    color: "#C10007",
  },
  {
    id: 3,
    name: "Daniel Reyes",
    badge: "",
    role: "Mortgage Advisor",
    initials: "DR",
    color: "#C10007",
  },
];

const extStyle: Record<Ext, { bg: string; icon: string }> = {
  pdf: { bg: "bg-[#C10007]/10", icon: "text-[#C10007]" },
  jpg: { bg: "bg-[#C10007]/10",      icon: "text-[#C10007]"  },
  png: { bg: "bg-[#C10007]/10",   icon: "text-[#C10007]" },
};


// ─── Sub-components ───────────────────────────────────────────────────────────
function CountBadge({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
      {n}
    </span>
  );
}

function SectionHeader({
  icon,
  title,
  count,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-gray-50 text-gray-400">
          {icon}
        </div>
        <h2 className="text-base font-bold text-[#1a1a1a]">{title}</h2>
        <CountBadge n={count} />
      </div>
      {action}
    </div>
  );
}

function DocCard({
  doc,
  onHistoryClick,
}: {
  doc: (typeof docs)[number];
  onHistoryClick: (name: string) => void;
}) {
  const { bg, icon } = extStyle[doc.ext];
  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-gray-200 hover:shadow-md">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${bg}`}>
        <FileText className={`h-5 w-5 ${icon}`} />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#1a1a1a]">
          {doc.name}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">Uploaded On: {doc.date}</p>
      </div>

      {/* Action buttons */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={() => onHistoryClick(doc.name)}
          className="cursor-pointer rounded-sm p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#1a1a1a] border border-gray-300"
          title="History"
        >
          <History className="h-4 w-4" />
        </button>
        <button
          className="cursor-pointer rounded-sm p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#1a1a1a] border border-gray-300"
          title="Rename"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          className="cursor-pointer rounded-sm p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-[#C10007] border border-gray-300"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PartnerCard({ p }: { p: (typeof partners)[number] }) {
  return (
    <div
      className="flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md"
      style={{ borderTop: `3px solid ${p.color}` }}
    >
      {/* Avatar */}
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
        style={{ backgroundColor: p.color }}
      >
        {p.initials}
      </div>

      {/* Name + role */}
      <div className="mt-4">
        <p className="font-semibold text-[#1a1a1a]">
          {p.name}{" "}
          {p.badge && (
            <span className="text-sm font-normal text-gray-400">{p.badge}</span>
          )}
        </p>
        <p className="mt-0.5 text-sm text-gray-500">{p.role}</p>
      </div>

      {/* More Info */}
      <button className="cursor-pointer mt-5 flex items-center gap-1 text-sm font-semibold text-[#1a1a1a] transition-colors hover:text-[#C10007]">
        More Info <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const [historyPopup, setHistoryPopup] = useState<{
    open: boolean;
    docName: string;
    docShortName: string;
  }>({ open: false, docName: "", docShortName: "" });

  const openHistory = (docName: string) => {
    // Derive a short label from the filename, e.g. "Agreement of Purchase..." → "APS"
    const short = docName.split(/[\s(]/)[0].replace(/\.[^.]+$/, "");
    setHistoryPopup({ open: true, docName, docShortName: short });
  };

  const closeHistory = () =>
    setHistoryPopup((prev) => ({ ...prev, open: false }));

  return (
    <>
      <div className="space-y-10">

        {/* ── Page heading + primary CTA ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1a1a1a]">
              Documents
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Manage your deal documents and partner contacts
            </p>
          </div>

          <button className="cursor-pointer flex items-center gap-2 rounded-sm bg-[#C10007] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#a00006]">
            <Upload className="h-4 w-4" />
            Upload Documents
          </button>
        </div>

        {/* ── Uploaded Documents — 2-column card grid ── */}
        <section className="space-y-4">
          <SectionHeader
            icon={<FileText className="h-4 w-4" />}
            title="Uploaded Documents"
            count={docs.length}
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {docs.map((doc) => (
              <DocCard key={doc.id} doc={doc} onHistoryClick={openHistory} />
            ))}
          </div>
        </section>

        {/* ── Divider ── */}
        <div className="h-px bg-gray-100" />

        {/* ── Partners — 3-column profile cards ── */}
        <section className="space-y-4">
          <SectionHeader
            icon={<Users className="h-4 w-4" />}
            title="Partners"
            count={partners.length}
            action={
              <button className="cursor-pointer flex items-center gap-1.5 rounded-sm border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#1a1a1a] shadow-sm transition-colors hover:bg-gray-50">
                <Plus className="h-4 w-4" />
                Add New Partner
              </button>
            }
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {partners.map((p) => (
              <PartnerCard key={p.id} p={p} />
            ))}
          </div>
        </section>

      </div>

      {/* ── Document History Popup ── */}
      <DocumentHistoryPopup
        open={historyPopup.open}
        onClose={closeHistory}
        docShortName={historyPopup.docShortName}
      />
    </>
  );
}
