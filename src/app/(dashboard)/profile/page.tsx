"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, User, Clock, Pencil, Check } from "lucide-react";
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

const REASON_LABELS: Record<string, string> = {
  self_update: "Updated by you",
  admin_update: "Updated by admin",
  rename: "Renamed",
  merge: "From merged record",
  maiden_name: "Maiden name",
};

function formatReason(reason: string | null): string {
  if (!reason) return "Previous name";
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function initials(first: string | null | undefined, last: string | null | undefined): string {
  const f = (first ?? "").trim().charAt(0);
  const l = (last ?? "").trim().charAt(0);
  return `${f}${l}`.toUpperCase() || "U";
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
      toastSuccess("Name updated. Your previous name has been saved.");
    } catch {
      toastError("Failed to update name.");
    } finally {
      setSaving(false);
    }
  }

  const aliases = useMemo(
    () =>
      (client?.name_aliases ?? [])
        .filter((a) => a.first_name || a.last_name)
        .slice()
        .sort((a, b) => (a.added_at < b.added_at ? 1 : -1)),
    [client]
  );

  const fullName = `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim() || "—";
  const dirty =
    (first ?? "").trim() !== (client?.first_name ?? "").trim() ||
    (last ?? "").trim() !== (client?.last_name ?? "").trim();

  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5 pb-8">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
            Profile
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Manage your name and view past names linked to your account.
          </p>
        </div>
      </div>

      {/* ── Name card ── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Identity header */}
        <div className="px-4 sm:px-6 py-5 sm:py-6 bg-gradient-to-br from-[#FEF2F2] to-white border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#C10007] text-white flex items-center justify-center font-bold text-lg sm:text-xl flex-shrink-0 shadow-sm">
              {loading ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                initials(client?.first_name, client?.last_name)
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#C10007]">
                Current name
              </p>
              <p className="text-base sm:text-xl font-bold text-gray-900 truncate">
                {loading ? "Loading..." : fullName}
              </p>
            </div>
          </div>
        </div>

        {/* Edit body */}
        <div className="px-4 sm:px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={20} className="text-gray-300 animate-spin" />
            </div>
          ) : !client ? (
            <p className="text-sm text-gray-500">Could not load your profile.</p>
          ) : editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                    First name
                  </label>
                  <input
                    autoFocus
                    value={first}
                    onChange={(e) => setFirst(e.target.value)}
                    placeholder="Enter your first name"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#C10007] focus:ring-2 focus:ring-[#FEF2F2] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                    Last name
                  </label>
                  <input
                    value={last}
                    onChange={(e) => setLast(e.target.value)}
                    placeholder="Enter your last name"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#C10007] focus:ring-2 focus:ring-[#FEF2F2] transition-colors"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Your previous name will be saved automatically so older files stay
                linked to you.
              </p>
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !dirty}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#C10007] text-white text-sm font-semibold hover:bg-[#a30006] disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm"
                >
                  {saving ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Check size={15} strokeWidth={2.5} />
                  )}
                  Save changes
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                Update your name if it&apos;s changed. We&apos;ll keep your previous
                name on file so all your records stay connected.
              </p>
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:border-[#C10007] hover:text-[#C10007] hover:bg-[#FEF2F2] transition-colors cursor-pointer self-start sm:self-auto"
              >
                <Pencil size={14} strokeWidth={2.2} />
                Edit name
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Aliases card ── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-[#FEF2F2] flex items-center justify-center flex-shrink-0">
            <Clock size={16} className="text-[#C10007]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-gray-900 leading-tight">
              Previously known as
            </h2>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
              Past names linked to your account.
            </p>
          </div>
          {aliases.length > 0 && (
            <span className="ml-auto inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-[#FEF2F2] text-[11px] font-bold text-[#C10007]">
              {aliases.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="text-gray-300 animate-spin" />
          </div>
        ) : aliases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
              <User size={20} className="text-gray-300" strokeWidth={1.6} />
            </div>
            <p className="text-sm font-semibold text-gray-700">
              No previous names yet
            </p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              When you change your name, your old one will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {aliases.map((a, i) => {
              const aliasName =
                `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "—";
              const when = formatDate(a.added_at);
              const reason = formatReason(a.reason);
              return (
                <li
                  key={`${aliasName}-${a.added_at}-${i}`}
                  className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-4"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {initials(a.first_name, a.last_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {aliasName}
                    </p>
                    <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 truncate">
                      {reason}
                      {when ? ` · ${when}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
