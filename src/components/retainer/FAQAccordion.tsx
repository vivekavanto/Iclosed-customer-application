"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";

export interface FAQItem {
  question: string;
  answer: string;
}

interface FAQAccordionProps {
  items: FAQItem[];
}

export default function FAQAccordion({ items }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div className="divide-y divide-[var(--color-border)]">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={index} className="group">
            <button
              type="button"
              onClick={() => toggle(index)}
              className="w-full flex items-start gap-3 sm:gap-4 py-4 sm:py-5 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-ring)] focus-visible:ring-offset-2 rounded-sm"
              aria-expanded={isOpen}
            >
              {/* Number badge */}
              <span
                className={[
                  "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-200",
                  isOpen
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-bg-alt)] text-[var(--color-text-muted)] group-hover:bg-[var(--color-surface-hover)] group-hover:text-[var(--color-primary)]",
                ].join(" ")}
              >
                {String(index + 1).padStart(2, "0")}
              </span>

              <span
                className={[
                  "flex-1 text-sm sm:text-[15px] font-medium leading-snug pt-0.5 transition-colors duration-200",
                  isOpen
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-text-heading)] group-hover:text-[var(--color-primary)]",
                ].join(" ")}
              >
                {item.question}
              </span>

              {/* Plus / Minus icon */}
              <span
                className={[
                  "flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 mt-0.5",
                  isOpen
                    ? "bg-[var(--color-primary)] text-white rotate-0"
                    : "bg-[var(--color-bg-alt)] text-[var(--color-text-muted)] group-hover:bg-[var(--color-surface-hover)]",
                ].join(" ")}
              >
                {isOpen ? <Minus size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
              </span>
            </button>

            {/* Answer panel */}
            <div
              className={`grid transition-all duration-300 ease-in-out ${
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <div className="pl-10 sm:pl-11 pr-4 pb-5">
                  <div className="border-l-2 border-[var(--color-primary)] pl-4">
                    <p className="text-sm text-[var(--color-text-body)] leading-relaxed">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
