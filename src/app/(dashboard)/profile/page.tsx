"use client";

import { useEffect, useState } from "react";
import { Loader2, User, History, Save, Pencil, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface NameAlias {
  first_name: string;
  last_name: string;
  added_at: string;
  added_by: string;
  reason: string | null;
}

interface ClientName {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name_aliases: NameAlias[] | null;
}

export default function ProfilePage() {
  const [client, setClient] = useState<ClientName | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [saving, setSaving] = useState(false);
  const { success: toastSuccess, error: toastError } = useToast();

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/clients/me/name");
      const data = await res.json();
      if (data.success) {
        setClient(data.client);
        setFirst(data.client?.first_name ?? "");
        setLast(data.client?.last_name ?? "");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit() {
    setFirst(client?.first_name ?? "");
    setLast(client?.last_name ?? "");
    setEditing(true);
  }

  function cancelEdit() {
    setFirst(client?.first_name ?? "");
    setLast(client?.last_name ?? "");
    setEditing(false);
  }

  async function save() {
    if (!first.trim() && !last.trim()) {
      toastError("Name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/clients/me/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: first.trim(), last_name: last.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError(data.error || "Failed to update name.");
        return;
      }
      setClient(data.client);
      setEditing(false);
      toastSuccess("Name updated. Your previous name has been saved as an alias.");
    } catch {
      toastError("Failed to update name.");
    } finally {
      setSaving(false);
    }
  }

  const aliases = (client?.name_aliases ?? []).filter(
    (a) => a.first_name || a.last_name
  );

  return (
    <div className="space-y-5 pb-8 max-w-3xl">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
            <User size={18} className="text-[#C10007]" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Your Name</h1>
            <p className="text-xs text-gray-500">
              Updating your name keeps your old name on file as an alias.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="text-gray-300 animate-spin" />
          </div>
        ) : !client ? (
          <p className="text-sm text-gray-500">Could not load your profile.</p>
        ) : editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  First name
                </label>
                <input
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#C10007] focus:ring-1 focus:ring-[#C10007]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  Last name
                </label>
                <input
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#C10007] focus:ring-1 focus:ring-[#C10007]"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C10007] text-white text-sm font-semibold hover:bg-[#a30006] disabled:opacity-60 cursor-pointer"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} strokeWidth={2.2} />
                )}
                Save
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                <X size={14} strokeWidth={2.2} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Current name
              </p>
              <p className="text-lg font-bold text-gray-900">
                {`${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "—"}
              </p>
            </div>
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              <Pencil size={14} strokeWidth={2.2} />
              Edit
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
            <History size={18} className="text-[#C10007]" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Previously known as</h2>
            <p className="text-xs text-gray-500">
              Past names linked to your account so historical files stay connected.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="text-gray-300 animate-spin" />
          </div>
        ) : aliases.length === 0 ? (
          <p className="text-sm text-gray-500">No previous names on file.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {aliases.map((a, i) => {
              const when = a.added_at
                ? new Date(a.added_at).toLocaleDateString("en-CA", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "";
              const fullName = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
              return (
                <li key={i} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{fullName || "—"}</p>
                    <p className="text-xs text-gray-400">
                      {a.reason ? a.reason.replace(/_/g, " ") : "previous name"}
                      {when ? ` · ${when}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
