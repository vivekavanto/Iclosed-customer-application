import { HTMLAttributes } from "react";

type ContainerSize = "sm" | "md" | "lg" | "xl" | "full";

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: ContainerSize;
  centered?: boolean;
}

const sizeClasses: Record<ContainerSize, string> = {
  sm: "max-w-xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-7xl",
  full: "max-w-full",
};

export default function Container({
  size = "lg",
  centered = true,
  className = "",
  children,
  ...rest
}: ContainerProps) {
  return (
    <div
      className={[
        "w-full px-4 sm:px-6 lg:px-8",
        sizeClasses[size],
        centered ? "mx-auto" : "",
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
