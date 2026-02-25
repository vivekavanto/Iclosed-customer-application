import { HTMLAttributes } from "react";

type BadgeVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-[var(--color-border)] text-[var(--color-text-body)]",
  primary: "bg-[var(--color-primary)] text-white",
  success: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  danger: "bg-red-100 text-[var(--color-primary)]",
  info: "bg-blue-100 text-blue-800",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-[var(--color-text-muted)]",
  primary: "bg-white",
  success: "bg-green-500",
  warning: "bg-yellow-500",
  danger: "bg-[var(--color-primary)]",
  info: "bg-blue-500",
};

export default function Badge({
  variant = "default",
  dot = false,
  className = "",
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  );
}
