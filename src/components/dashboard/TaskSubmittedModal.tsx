"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const TaskSubmittedModal: React.FC<{
  title: string | null;
  subtitle?: string;
  onClose: () => void;
  durationMs?: number;
}> = ({ title, subtitle, onClose, durationMs = 1000 }) => {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!title) return;
    const t = setTimeout(() => onCloseRef.current(), durationMs);
    return () => clearTimeout(t);
  }, [title, durationMs]);

  if (!title) return null;

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-[95] flex items-center justify-center px-4 pointer-events-none" role="status">
        <div className="pointer-events-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 px-6 sm:px-8 pt-6 pb-4 border-b border-gray-100">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-6 sm:px-8 py-6">
            <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4">
              <p className="text-sm font-bold text-green-700">Submitted successfully!</p>
              <p className="text-xs text-green-700/80 mt-0.5">Your response has been saved.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default TaskSubmittedModal;
