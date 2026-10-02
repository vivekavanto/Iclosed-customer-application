"use client";

import { useState } from "react";
import { Loader2, MessageSquare, X } from "lucide-react";
import { PORTAL_TEAM, teamInitials } from "@/lib/portalTeam";

interface ChatMessage {
  text: string;
  failed?: boolean;
}

// Messages go to the support inbox via /api/contact; replies come back by email.
export default function ChatWidget({
  name,
  email,
  fileNumber,
  address,
}: {
  name: string;
  email: string | null;
  fileNumber: string | null;
  address: string;
}) {
  const csm = PORTAL_TEAM.find((m) => m.role === "Customer Success Manager");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    if (!email) {
      setError("We couldn't find your email address. Please email hello@iclosed.ca.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          message: `Portal chat · File ${fileNumber ?? "—"} · ${address || "—"}\n\n${text}`,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error ?? "Message not sent.");
      setMessages((m) => [...m, { text }]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message not sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed right-6 bottom-6 z-[35] flex flex-col items-end gap-3" style={{ bottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}>
      {open && (
        <div className="flex w-[min(340px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center gap-2.5 bg-[#C10007] px-4 py-3.5 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
              {csm ? teamInitials(csm.name) : "iC"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Chat with your team</p>
              <p className="text-xs opacity-85">We reply by email, usually within a few hours</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="cursor-pointer text-white/90 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto bg-gray-50 px-4 py-3.5">
            <div className="max-w-[85%] self-start rounded-xl rounded-bl-sm border border-gray-100 bg-white px-3 py-2 text-[13px] leading-normal text-gray-700">
              Hi! I&apos;m {csm?.name.split(" ")[0] ?? "your Customer Success Manager"}
              {csm ? ", your Customer Success Manager" : ""}. Ask me anything about your file.
            </div>
            {messages.map((m, i) => (
              <div
                key={i}
                className="max-w-[85%] self-end rounded-xl rounded-br-sm bg-[#C10007] px-3 py-2 text-[13px] leading-normal text-white"
              >
                {m.text}
              </div>
            ))}
            {messages.length > 0 && (
              <p className="self-center text-[11px] text-gray-400">Sent — we&apos;ll reply to {email}</p>
            )}
            {error && <p className="text-xs text-[#C10007]">{error}</p>}
          </div>
          <div className="flex gap-2 border-t border-gray-100 p-2.5">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a message…"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-[#C10007]"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || draft.trim().length < 5}
              className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-[#C10007] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {sending && <Loader2 size={13} className="animate-spin" />}
              Send
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer flex items-center gap-2 rounded-full bg-[#C10007] py-3 pl-3.5 pr-[18px] text-sm font-bold text-white shadow-lg hover:bg-[#a30006]"
      >
        <MessageSquare size={20} />
        <span className="whitespace-nowrap">Chat with us</span>
      </button>
    </div>
  );
}
