import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = "", id, ...rest }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--color-text-heading)]"
          >
            {label}
          </label>
        )}

        <input
          ref={ref}
          id={inputId}
          className={[
            "w-full px-4 py-2.5 rounded-sm border text-sm transition-colors duration-150",
            "bg-[var(--color-surface)] text-[var(--color-text-heading)]",
            "placeholder:text-[var(--color-text-muted)]",
            error
              ? "border-[var(--color-error)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-ring)]"
              : "border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-ring)] focus:border-[var(--color-primary)]",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />

        {error && (
          <p className="text-xs text-[var(--color-error)] mt-0.5">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
export default Input;
