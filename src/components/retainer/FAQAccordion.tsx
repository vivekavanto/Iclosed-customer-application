"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

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
    <div className="py-2">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={index}>
            <button
              type="button"
              onClick={() => toggle(index)}
              className="w-full flex items-center justify-between gap-4 py-4 text-left cursor-pointer focus:outline-none group"
              aria-expanded={isOpen}
            >
              <span
                className={[
                  "text-sm font-semibold leading-snug transition-colors duration-200",
                  isOpen
                    ? "text-gray-900"
                    : "text-gray-700 group-hover:text-gray-900",
                ].join(" ")}
              >
                {item.question}
              </span>

              <ChevronDown
                size={18}
                strokeWidth={2}
                className={[
                  "flex-shrink-0 text-gray-400 transition-transform duration-200",
                  isOpen ? "rotate-180" : "",
                ].join(" ")}
              />
            </button>

            {/* Answer panel */}
            <div
              className={`grid transition-all duration-300 ease-in-out ${
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p className="text-sm text-gray-500 leading-relaxed pb-4">
                  {item.answer}
                </p>
              </div>
            </div>

            {/* Divider between items */}
            {index < items.length - 1 && (
              <div className="border-t border-gray-100" />
            )}
          </div>
        );
      })}
    </div>
  );
}
