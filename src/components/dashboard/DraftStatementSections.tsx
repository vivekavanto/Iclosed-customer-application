import { Info } from "lucide-react";
import type { DraftLine, DraftSection } from "@/lib/draftStatement";

// Info icon whose note shows on hover, keyboard focus or tap.
function NoteIcon({ label, note }: { label: string; note: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`What is ${label}?`}
        className="inline-flex shrink-0 items-center justify-center text-gray-400 transition-colors hover:text-gray-600 focus:outline-none cursor-help"
      >
        <Info size={15} strokeWidth={1.75} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-60 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {note}
      </span>
    </span>
  );
}

// Deductions print with a minus sign; zero reads "$0.00".
function screenAmount(line: DraftLine): string {
  if (line.screen?.amount) return line.screen.amount;
  const raw = line.amount;
  const m = /^\((.*)\)$/.exec(raw);
  if (!m) return raw;
  return /^\$0\.00$/.test(m[1]) ? m[1] : `−${m[1]}`;
}

/** Draft sections as one card; `highlight` tints one. */
export default function DraftStatementSections({
  sections,
  brand,
  highlight,
}: {
  sections: DraftSection[];
  brand: string;
  /** Title of the section shown as the tinted funds summary. */
  highlight?: string;
}) {
  return (
    // No overflow-hidden: tooltips must escape the card.
    <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
      {sections.map((section) => {
        const tinted = section.title === highlight;
        const lines = section.lines.filter((l) => !l.screen?.hidden);
        return (
          <section
            key={section.title}
            className="px-4 sm:px-6 py-4 sm:py-5 first:rounded-t-xl last:rounded-b-xl"
            style={tinted ? { backgroundColor: `${brand}0A` } : undefined}
          >
            <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-gray-500">
              {section.title}
            </h4>
            <div className="mt-2">
              {lines.map((line) => {
                const label = line.screen?.label ?? line.label;
                // Screen tip first; the note is the PDF's longer wording.
                const info = line.tip ?? line.note;
                const big = tinted && line.total;
                return (
                  <div
                    key={line.label}
                    className={`flex items-center justify-between gap-4 ${
                      line.total ? "mt-2 border-t border-gray-200 pt-3 font-bold text-gray-900" : "py-1 text-gray-700"
                    } ${big ? "text-base sm:text-lg" : "text-[13px] sm:text-sm"}`}
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {label}
                      {info && !line.total && <NoteIcon label={label} note={info} />}
                      {line.screen?.estimate && (
                        <span className="rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#92400E]">
                          Estimate
                        </span>
                      )}
                    </span>
                    <span
                      className="whitespace-nowrap tabular-nums text-gray-900"
                      style={big ? { color: brand } : undefined}
                    >
                      {screenAmount(line)}
                    </span>
                  </div>
                );
              })}
            </div>
            {(section.screenNote ?? section.note) && (
              <p className="mt-2 text-xs leading-relaxed text-gray-500">{section.screenNote ?? section.note}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
