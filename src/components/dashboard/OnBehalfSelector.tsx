"use client";

import { ChevronDown } from "lucide-react";

export interface BehalfTarget {
  lead_id: string;
  task_id: string;
  first_name: string;
  last_name: string;
  role_label: string;
  is_primary: boolean;
}

export function behalfTargetName(t: BehalfTarget): string {
  const name = [t.first_name, t.last_name].filter(Boolean).join(" ").trim();
  return `${name || "Applicant"} — ${t.role_label}`;
}

/**
 * Person picker shown at the top of the Upload Identification / Personal
 * Information drawers when the primary applicant opted into "submit on behalf"
 * and has linked co-purchaser(s)/co-seller(s). Selecting a person retargets the
 * drawer at that person's task/lead. Renders nothing unless there is more than
 * one possible target (i.e. there is actually someone to submit on behalf of).
 */
export default function OnBehalfSelector({
  label,
  targets,
  selectedLeadId,
  onChange,
}: {
  label: string;
  targets: BehalfTarget[];
  selectedLeadId: string | null;
  onChange: (leadId: string) => void;
}) {
  if (!targets || targets.length <= 1) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3.5">
      <label className="block text-sm font-semibold text-gray-900 mb-2">
        {label}
      </label>
      <div className="relative">
        <select
          value={selectedLeadId ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 pr-10 text-sm font-medium text-gray-900 focus:border-[#C10007] focus:outline-none focus:ring-1 focus:ring-[#C10007] cursor-pointer"
        >
          {targets.map((t) => (
            <option key={t.lead_id} value={t.lead_id}>
              {behalfTargetName(t)}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
      </div>
    </div>
  );
}
