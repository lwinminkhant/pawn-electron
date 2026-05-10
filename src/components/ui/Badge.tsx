import React from "react";
import { cn } from "../../utils/format";

type Tone = "neutral" | "brass" | "success" | "warning" | "danger" | "info";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
  size?: "sm" | "md";
}

const toneStyles: Record<Tone, { bg: string; text: string; dot: string }> = {
  neutral: {
    bg: "bg-[var(--surface-sunken)]",
    text: "text-[var(--text-secondary)]",
    dot: "bg-[var(--text-muted)]",
  },
  brass: {
    bg: "bg-[var(--brass-soft)]",
    text: "text-[var(--brass)]",
    dot: "bg-[var(--brass)]",
  },
  success: {
    bg: "bg-[var(--success-soft)]",
    text: "text-[var(--success)]",
    dot: "bg-[var(--success)]",
  },
  warning: {
    bg: "bg-[var(--warning-soft)]",
    text: "text-[var(--warning)]",
    dot: "bg-[var(--warning)]",
  },
  danger: {
    bg: "bg-[var(--danger-soft)]",
    text: "text-[var(--danger)]",
    dot: "bg-[var(--danger)]",
  },
  info: {
    bg: "bg-[var(--brass-softer)]",
    text: "text-[var(--text-secondary)]",
    dot: "bg-[var(--brass)]",
  },
};

export const Badge: React.FC<BadgeProps> = ({
  tone = "neutral",
  dot,
  size = "sm",
  className,
  children,
  ...rest
}) => {
  const s = toneStyles[tone];
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center gap-1.5 font-medium rounded-full whitespace-nowrap",
        size === "sm" ? "text-[11px] px-2 py-0.5" : "text-[12px] px-2.5 py-1",
        s.bg,
        s.text,
        className
      )}
    >
      {dot && (
        <span
          className={cn("w-1.5 h-1.5 rounded-full", s.dot)}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
};
