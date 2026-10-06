"use client";

/** Single-choice chips used in place of radio buttons. */
export default function ChoiceChips({
  options,
  value,
  onChange,
  onBlur,
  label,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            onBlur={onBlur}
            className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors ${
              selected
                ? "border-[#C10007] bg-[#FEF2F2] font-semibold text-[#C10007]"
                : "border-gray-200 bg-white text-gray-700 hover:border-[#C10007]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
