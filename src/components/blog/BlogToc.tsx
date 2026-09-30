"use client";

import { useEffect, useState } from "react";
import { List } from "lucide-react";
import type { BlogTocItem } from "@/lib/blogToc";

/**
 * "Table of contents" — the sticky panel beside an article.
 *
 * The links are plain `<a href="#id">`, so they work with JavaScript off, on a
 * middle-click, and when someone shares the URL with the fragment still on it.
 * The click handler only adds the nice parts (smooth scroll, and putting the
 * fragment in the address bar without pushing a history entry per heading, so
 * Back still leaves the article rather than walking up the sidebar).
 *
 * Highlighting the section being read is done with scroll position rather than
 * an IntersectionObserver keyed on "is visible": on a long article several
 * headings are on screen at once, and the useful answer is the LAST heading
 * the reader has scrolled past, which visibility alone does not give.
 */
export default function BlogToc({
  items,
  className = "",
}: {
  items: BlogTocItem[];
  className?: string;
}) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    if (items.length === 0) return;

    const update = () => {
      // Matches scroll-mt on the headings: a heading sitting just under the
      // sticky header counts as "here", not as "still below".
      const line = 140;
      let current = items[0].id;

      for (const item of items) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - line <= 0) current = item.id;
      }

      // At the very bottom the last section may be too short to ever cross the
      // line; without this it can never be the active one.
      const atBottom =
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 2;
      if (atBottom) current = items[items.length - 1].id;

      setActiveId(current);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items]);

  if (items.length < 2) return null;

  const onJump = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return; // Let the browser handle it the ordinary way.

    event.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
    setActiveId(id);
  };

  // Every entry carries a serial number, h3s included — the list reads as a
  // numbered run of sections the way a contents page does. Nothing is indented
  // by heading level: an h3 used to be pushed right, which knocked its number
  // out of the column the others share (and an article whose first entry is an
  // h3, like "Key takeaways", started with the odd one out). Numbers sit in a
  // fixed-width column instead, so they line up down the list and a wrapped
  // title hangs under its own first line rather than under the number. Worked
  // out here rather than with a counter inside the map, which would be a
  // mutation during render.
  const numbered = items.map((item, index) => ({ ...item, number: index + 1 }));

  return (
    <nav
      aria-label="Table of contents"
      className={`rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_20px_rgba(0,0,0,0.06)] ${className}`}
    >
      <p className="mb-5 flex items-center gap-2.5 text-[19px] font-bold tracking-tight text-gray-900">
        <List size={18} strokeWidth={2.4} className="shrink-0 text-[#C10007]" />
        Table of contents
      </p>

      {/* Capped and scrollable, not open-ended: a long article would otherwise
          produce a list taller than the viewport, and the entries past the fold
          would be unreachable on the one screen the sticky panel occupies. */}
      <ul className="max-h-80 space-y-0.5 overflow-y-auto pr-2 [scrollbar-color:#e5e7eb_transparent] [scrollbar-width:thin] lg:max-h-[calc(100vh-11rem)]">
        {numbered.map((item) => {
          const isActive = item.id === activeId;

          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(event) => onJump(event, item.id)}
                aria-current={isActive ? "location" : undefined}
                className={[
                  "flex items-start gap-3 rounded-lg px-3 py-2.5 text-[14.5px] leading-snug transition-colors duration-150",
                  isActive
                    ? "bg-red-50/70 font-semibold text-[#C10007]"
                    : "font-medium text-gray-700 hover:bg-gray-50 hover:text-[#C10007]",
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className={`w-6 shrink-0 pt-px text-left text-[13px] font-bold tabular-nums ${
                    isActive ? "text-[#C10007]" : "text-[#C10007]/55"
                  }`}
                >
                  {String(item.number).padStart(2, "0")}
                </span>
                <span className="min-w-0">{item.text}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
