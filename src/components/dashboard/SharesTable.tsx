"use client";

// Stored as "Jane Doe — 30%; John Doe — 70%".
export interface Share {
  name: string;
  percent: string;
}

export function parseShares(value: string): Share[] {
  return (value ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(.*?)\s*[—–-]?\s*([\d.]+)\s*%$/);
      return m ? { name: m[1].trim(), percent: m[2] } : { name: p, percent: "" };
    });
}

export function formatShares(rows: Share[]): string {
  return rows.filter((r) => r.percent.trim()).map((r) => `${r.name} — ${r.percent.trim()}%`).join("; ");
}

export function sharesTotal(rows: Share[]): number {
  return Math.round(rows.reduce((s, r) => s + (parseFloat(r.percent) || 0), 0) * 100) / 100;
}

/** Everyone below the largest share. */
export function minorityNames(rows: Share[]): string[] {
  const pct = rows.map((r) => parseFloat(r.percent) || 0);
  const max = Math.max(...pct);
  return rows.filter((_, i) => pct[i] < max).map((r) => r.name);
}

/** Saved shares in the given names' order. */
export function sharesFor(names: string[], value: string): Share[] {
  const saved = parseShares(value);
  return names.map((name) => ({ name, percent: saved.find((s) => s.name === name)?.percent ?? "" }));
}

export default function SharesTable({
  rows,
  invalid,
  onChange,
}: {
  rows: Share[];
  invalid: boolean;
  onChange: (rows: Share[]) => void;
}) {
  const total = sharesTotal(rows);
  return (
    <div className={`overflow-hidden rounded-xl border ${invalid ? "border-[#C10007]" : "border-gray-200"}`}>
      {rows.map((row, i) => (
        <div key={row.name} className="flex items-center justify-between gap-4 border-b border-gray-100 px-4 py-2.5">
          <span className="text-sm font-semibold text-gray-900">{row.name}</span>
          <div className="relative w-28 shrink-0">
            <input
              type="text"
              inputMode="decimal"
              value={row.percent}
              placeholder="0"
              aria-label={`${row.name} share`}
              onChange={(e) =>
                onChange(rows.map((r, j) => (j === i ? { ...r, percent: e.target.value.replace(/[^\d.]/g, "") } : r)))
              }
              className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-3 pr-8 text-right text-sm text-gray-900 outline-none focus:border-[#C10007] focus:ring-2 focus:ring-[#C10007]/10"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
        <span className="text-sm font-semibold text-gray-900">Total</span>
        <span className={`text-sm font-semibold ${total === 100 ? "text-green-700" : "text-gray-500"}`}>{total}%</span>
      </div>
    </div>
  );
}
