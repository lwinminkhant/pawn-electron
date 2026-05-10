import React from "react";
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { cn } from "../../utils/format";

type BannerTone = "info" | "success" | "warning" | "danger";

interface BannerProps {
  tone?: BannerTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

const bannerConfig: Record<
  BannerTone,
  {
    bg: string;
    text: string;
    border: string;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
  }
> = {
  info: {
    bg: "bg-[var(--brass-softer)]",
    text: "text-[var(--text-primary)]",
    border: "border-[var(--brass)]/30",
    Icon: Info,
  },
  success: {
    bg: "bg-[var(--success-soft)]",
    text: "text-[var(--success)]",
    border: "border-[var(--success)]/30",
    Icon: CheckCircle2,
  },
  warning: {
    bg: "bg-[var(--warning-soft)]",
    text: "text-[var(--warning)]",
    border: "border-[var(--warning)]/30",
    Icon: AlertTriangle,
  },
  danger: {
    bg: "bg-[var(--danger-soft)]",
    text: "text-[var(--danger)]",
    border: "border-[var(--danger)]/30",
    Icon: AlertCircle,
  },
};

export const Banner: React.FC<BannerProps> = ({
  tone = "info",
  title,
  children,
  className,
}) => {
  const c = bannerConfig[tone];
  const Icon = c.Icon;
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 border rounded-[8px]",
        c.bg,
        c.border,
        className
      )}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon size={16} className={cn("mt-0.5 shrink-0", c.text)} aria-hidden />
      <div className="min-w-0 flex-1 text-[13px]">
        {title && <p className={cn("font-semibold", c.text)}>{title}</p>}
        {children && (
          <div
            className={cn(
              "text-[var(--text-secondary)]",
              title ? "mt-0.5" : ""
            )}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 20,
  className,
  label,
}) => (
  <div
    className={cn("inline-flex items-center gap-2", className)}
    role="status"
    aria-live="polite"
  >
    <span
      style={{ width: size, height: size }}
      className="inline-block rounded-full border-2 border-[var(--hairline-strong)] border-t-[var(--brass)] animate-spin"
      aria-hidden
    />
    {label && (
      <span className="text-[13px] text-[var(--text-secondary)]">{label}</span>
    )}
  </div>
);

export const PageLoader: React.FC<{ label?: string }> = ({
  label = "Loading…",
}) => (
  <div className="flex items-center justify-center py-20">
    <Spinner size={24} label={label} />
  </div>
);
