import React from "react";
import { cn } from "../../utils/format";

/* ---------- Card ---------- */

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "flush" | "outlined";
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  variant = "default",
  interactive,
  className,
  children,
  ...rest
}) => (
  <div
    {...rest}
    className={cn(
      "bg-[var(--surface-raised)] border border-[var(--hairline)]",
      "rounded-[10px] overflow-hidden",
      variant === "outlined" && "bg-transparent",
      variant === "flush" && "border-0 rounded-none",
      interactive &&
        "transition-colors duration-150 hover:border-[var(--hairline-strong)] cursor-pointer",
      className
    )}
  >
    {children}
  </div>
);

export const CardHeader: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { divider?: boolean }
> = ({ divider = true, className, children, ...rest }) => (
  <div
    {...rest}
    className={cn(
      "px-5 py-4",
      divider && "border-b border-[var(--hairline)]",
      className
    )}
  >
    {children}
  </div>
);

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...rest
}) => (
  <div {...rest} className={cn("px-5 py-4", className)}>
    {children}
  </div>
);

export const CardFooter: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { divider?: boolean }
> = ({ divider = true, className, children, ...rest }) => (
  <div
    {...rest}
    className={cn(
      "px-5 py-3",
      divider && "border-t border-[var(--hairline)]",
      className
    )}
  >
    {children}
  </div>
);

/* ---------- StatCard — the signature brass-hairline tile ---------- */

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  trend?: {
    value: string;
    direction: "up" | "down" | "flat";
  };
  accent?: boolean;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  hint,
  trend,
  accent,
  className,
}) => (
  <div
    className={cn(
      "relative bg-[var(--surface-raised)] border border-[var(--hairline)]",
      "rounded-[10px] px-5 py-4 overflow-hidden",
      className
    )}
  >
    {accent && (
      <span
        aria-hidden
        className="absolute left-0 top-4 bottom-4 w-[2px] bg-[var(--brass)] rounded-full"
      />
    )}
    <p className="eyebrow">{label}</p>
    <p className="mono text-[28px] font-semibold leading-tight mt-1.5 text-[var(--text-primary)]">
      {value}
    </p>
    <div className="flex items-center gap-2 mt-1.5 min-h-[18px]">
      {trend && (
        <span
          className={cn(
            "mono text-[12px] font-medium",
            trend.direction === "up" && "text-[var(--success)]",
            trend.direction === "down" && "text-[var(--danger)]",
            trend.direction === "flat" && "text-[var(--text-muted)]"
          )}
        >
          {trend.direction === "up" && "▲ "}
          {trend.direction === "down" && "▼ "}
          {trend.value}
        </span>
      )}
      {hint && (
        <span className="text-[12px] text-[var(--text-muted)]">{hint}</span>
      )}
    </div>
  </div>
);

/* ---------- PageHeader ---------- */

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  eyebrow,
  actions,
  className,
}) => {
  const hasHeaderText = Boolean(eyebrow || title || description);

  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-4 pb-6 mb-6",
        "border-b border-[var(--hairline)]",
        className
      )}
    >
      {hasHeaderText && (
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          {title && (
            <h1 className="text-[22px] font-semibold text-[var(--text-primary)] tracking-tight">
              {title}
            </h1>
          )}
          {description && (
            <p className="text-[13px] text-[var(--text-secondary)] mt-1">
              {description}
            </p>
          )}
        </div>
      )}
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
};

/* ---------- EmptyState ---------- */

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center text-center px-6 py-12",
      className
    )}
  >
    {icon && (
      <div className="text-[var(--text-muted)] mb-3" aria-hidden>
        {icon}
      </div>
    )}
    <p className="text-[15px] font-medium text-[var(--text-primary)]">
      {title}
    </p>
    {description && (
      <p className="text-[13px] text-[var(--text-secondary)] mt-1 max-w-sm">
        {description}
      </p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/* ---------- Divider ---------- */

export const Divider: React.FC<{ className?: string }> = ({ className }) => (
  <hr
    className={cn("border-0 border-t border-[var(--hairline)]", className)}
  />
);
