"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

// Stored as one "a | b | c" line per row, readable in admin.
const SEP = " | ";

export function parseRows(value: string, width: number): string[][] {
  const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((l) => {
    const cells = l.split(SEP.trim()).map((c) => c.trim());
    return Array.from({ length: width }, (_, i) => cells[i] ?? "");
  });
  return rows.length > 0 ? rows : [Array(width).fill("")];
}

export function serializeRows(rows: string[][]): string {
  return rows
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => r.map((c) => c.replace(/\|/g, "/").trim()).join(SEP).replace(/(\s\|\s*)+$/, ""))
    .join("\n");
}

/** Item rows with a delete button each and "+ Add another item". */
export default function RepeaterRows({
  placeholders,
  value,
  invalid,
  onChange,
}: {
  placeholders: string[];
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const [rows, setRows] = useState(() => parseRows(value, placeholders.length));

  const update = (next: string[][]) => {
    setRows(next);
    onChange(serializeRows(next));
  };

  const input = `w-full rounded-lg border bg-white px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10 ${
    invalid ? "border-[#C10007]" : "border-gray-200"
  }`;

  return (
    <div className="space-y-2">
      {rows.map((row, r) => (
        <div key={r} className="flex items-start gap-2">
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
            {placeholders.map((ph, c) => (
              <input
                key={c}
                type="text"
                value={row[c]}
                placeholder={ph}
                onChange={(e) => update(rows.map((x, i) => (i === r ? x.map((v, j) => (j === c ? e.target.value : v)) : x)))}
                className={input}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => update(rows.length > 1 ? rows.filter((_, i) => i !== r) : [Array(placeholders.length).fill("")])}
            className="cursor-pointer flex h-[46px] w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:text-[#C10007]"
            aria-label="Remove item"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows([...rows, Array(placeholders.length).fill("")])}
        className="cursor-pointer rounded-lg border border-dashed border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        + Add another item
      </button>
    </div>
  );
}
