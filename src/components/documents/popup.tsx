"use client";

import { useEffect } from "react";
import { X, Download, Trash2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface VersionEntry {
  id: number;
  date: string;
  fileName: string;
  uploadedAt: string;
}

interface DocumentHistoryPopupProps {
  open: boolean;
  onClose: () => void;
  docShortName?: string;
  versions?: VersionEntry[];
}

// ─── Default data ─────────────────────────────────────────────────────────────
const defaultVersions: VersionEntry[] = [
  {
    id: 1,
    date: "June 5, 2025 (current)",
    fileName: "APS_123ExampleStreet_Toronto.pdf",
    uploadedAt: "2:14 PM (EST)",
  },
  {
    id: 2,
    date: "July 23, 2025 (current)",
    fileName: "APS_234ExampleStreet_Toronto.pdf",
    uploadedAt: "4:30 AM (EST)",
  },
  {
    id: 3,
    date: "August 19, 2025 (current)",
    fileName: "APS_546ExampleStreet_Toronto.pdf",
    uploadedAt: "7:12 PM (EST)",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function DocumentHistoryPopup({
  open,
  onClose,
  docShortName = "Aps",
  versions = defaultVersions,
}: DocumentHistoryPopupProps) {
  // Close on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          "fixed inset-0 z-40 bg-black/30 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer — slides in from right */}
      <div
        className={[
          "fixed top-0 right-0 z-50 h-full w-full max-w-[400px] bg-white shadow-2xl",
          "flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={`${docShortName} Version History`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className="text-lg font-bold text-[#1a1a1a]">
            {docShortName} Version History
          </h2>
          <button
            onClick={onClose}
            className=" cursor-pointer rounded-md p-1 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-200 mx-0" />

        {/* Version list */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {versions.map((v) => (
            <div key={v.id} className="space-y-2">
              {/* Date group label */}
              <p className="text-sm font-medium text-gray-500">{v.date}</p>

              {/* File card */}
              <div className="flex items-center justify-between gap-3 rounded-md bg-[#f5f5f5] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#1a1a1a]">
                    {v.fileName}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Uploaded On: {v.uploadedAt}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    className="cursor-pointer flex h-8 w-8 items-center justify-center rounded-sm border border-gray-300 bg-white text-gray-500 hover:text-[#1a1a1a] hover:bg-gray-50 transition-colors"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    className="cursor-pointer flex h-8 w-8 items-center justify-center rounded-sm border border-gray-300 bg-white text-gray-500 hover:text-[#C10007] hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
