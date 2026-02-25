import { HTMLAttributes } from "react";

type CardVariant = "default" | "bordered" | "elevated";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
}

const variantClasses: Record<CardVariant, string> = {
  default: "bg-[var(--color-surface)] border border-[var(--color-border)]",
  bordered:
    "bg-[var(--color-surface)] border-2 border-[var(--color-primary)] border-opacity-30",
  elevated:
    "bg-[var(--color-surface)] shadow-md border border-[var(--color-border)]",
};

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export default function Card({
  variant = "default",
  padding = "md",
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        "rounded-xl transition-shadow duration-200",
        variantClasses[variant],
        paddingClasses[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
