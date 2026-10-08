"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getFirm, type FirmKey } from "@/lib/firms";

const inputBase =
  "w-full px-4 py-3 text-sm text-gray-900 bg-white border rounded-lg outline-none transition-colors duration-150 placeholder:text-gray-400";

interface ClientNameReadOnlySectionProps {
  firstName?: string | null;
  lastName?: string | null;
  leadId?: string;
  // Picks the support address shown if the request fails.
  firmKey?: FirmKey | null;
}

export default function ClientNameReadOnlySection({
  firstName,
  lastName,
  leadId,
  firmKey,
}: ClientNameReadOnlySectionProps) {
  const firm = getFirm(firmKey);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  // Success message clears itself after a second.
  useEffect(() => {
    if (!status?.ok) return;
    const t = setTimeout(() => setStatus(null), 1000);
    return () => clearTimeout(t);
  }, [status]);
  const [request, setRequest] = useState("");
  const [sending, setSending] = useState(false);

  const currentFirstName = firstName?.trim() ?? "";
  const currentLastName = lastName?.trim() ?? "";
  const currentFullName = [currentFirstName, currentLastName].filter(Boolean).join(" ");

  async function send() {
    if (!request.trim()) return;
    if (!leadId) {
      setStatus({ ok: false, text: "Unable to send request. Please try again or contact the law clerk directly." });
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/name-change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          current_first_name: currentFirstName,
          current_last_name: currentLastName,
          message: request.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to send request");
      setStatus({ ok: true, text: "Your name change request has been sent to your law clerk." });
      setRequest("");
      setOpen(false);
    } catch (err) {
      console.error(err);
      setStatus({ ok: false, text: `Failed to send your request. Please try again or email ${firm.supportEmail}.` });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="fullName" className="text-sm font-semibold text-gray-800">
        Full Name
      </label>
      <input
        id="fullName"
        type="text"
        value={currentFullName}
        readOnly
        aria-readonly="true"
        tabIndex={-1}
        className={[inputBase, "border-gray-200 bg-gray-50 text-gray-500 cursor-default"].join(" ")}
      />
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setStatus(null);
        }}
        className="self-start cursor-pointer text-[13px] font-semibold text-[#C10007] hover:underline"
      >
        Request name change
      </button>
      {open && (
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Correct full legal name and reason"
            className={[
              inputBase,
              "flex-1 min-w-[220px] w-auto py-2.5 border-gray-200 focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10",
            ].join(" ")}
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || !request.trim()}
            className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-[#C10007] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#a30006] disabled:opacity-60"
          >
            {sending && <Loader2 size={14} className="animate-spin" />}
            Send request
          </button>
        </div>
      )}
      {status && !status.ok && (
        <p role="alert" className="rounded-lg border border-red-200 bg-[#FEF2F2] px-3 py-2 text-xs text-[#C10007]">
          {status.text}
        </p>
      )}
      {status?.ok && (
        <div
          role="status"
          className="fixed bottom-7 left-1/2 z-[120] -translate-x-1/2 rounded-[10px] bg-gray-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg"
        >
          {status.text}
        </div>
      )}
    </div>
  );
}
