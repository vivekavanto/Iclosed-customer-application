import { Info } from "lucide-react";
import type { DraftSection } from "@/lib/draftStatement";

// Info icon whose note shows on hover, keyboard focus or tap.
function NoteIcon({ label, note, brand }: { label: string; note: string; brand: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`What is ${label}?`}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 focus:outline-none cursor-help"
      >
        <Info size={10} strokeWidth={2.5} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute -left-2 top-6 z-30 w-64 rounded-lg border bg-white p-2.5 text-[11px] font-normal leading-relaxed text-gray-600 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
        style={{ borderColor: `${brand}33` }}
      >
        {note}
      </span>
    </span>
  );
}

/** Renders v4 draft statement sections as shaded tables. */
export default function DraftStatementSections({
  sections,
  brand,
}: {
  sections: DraftSection[];
  brand: string;
}) {
  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <section key={section.title}>
          <h4 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: brand }}>
            {section.title}
          </h4>
          <div className="mt-2 rounded-lg border border-gray-100">
            {section.lines.map((line, i) => (
              <div
                key={line.label}
                className={`flex items-center justify-between gap-4 px-3 py-2 text-[13px] first:rounded-t-lg last:rounded-b-lg ${
                  i % 2 === 0 ? "bg-gray-50" : "bg-white"
                } ${line.total ? "border-t border-gray-200 font-bold text-gray-900" : "text-gray-700"}`}
              >
                <span className="flex items-center gap-1.5">
                  {line.label}
                  {(line.note ?? line.tip) && (
                    <NoteIcon label={line.label} note={(line.note ?? line.tip) as string} brand={brand} />
                  )}
                </span>
                <span className="whitespace-nowrap font-semibold tabular-nums text-gray-900">{line.amount}</span>
              </div>
            ))}
          </div>
          {section.note && <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{section.note}</p>}
        </section>
      ))}
    </div>
  );
}
