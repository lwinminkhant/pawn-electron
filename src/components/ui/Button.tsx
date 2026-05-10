import React from "react";
import { cn } from "../../utils/format";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 font-medium " +
  "rounded-[6px] transition-colors duration-150 select-none " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--brass)] text-[var(--brass-text-on)] " +
    "hover:bg-[var(--brass-hover)] " +
    "border border-[var(--brass)]",
  secondary:
    "bg-[var(--surface-raised)] text-[var(--text-primary)] " +
    "border border-[var(--hairline)] " +
    "hover:bg-[var(--surface-hover)] hover:border-[var(--hairline-strong)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] " +
    "border border-transparent " +
    "hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
  danger:
    "bg-transparent text-[var(--danger)] " +
    "border border-[var(--hairline)] " +
    "hover:bg-[var(--danger-soft)] hover:border-[var(--danger)]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-[14px]",
  lg: "h-12 px-5 text-[15px]",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "secondary",
  size = "md",
  leadingIcon,
  trailingIcon,
  loading,
  fullWidth,
  children,
  className,
  disabled,
  type = "button",
  ...rest
}) => (
  <button
    {...rest}
    type={type}
    disabled={disabled || loading}
    className={cn(
      base,
      variants[variant],
      sizes[size],
      fullWidth && "w-full",
      className
    )}
  >
    {loading ? (
      <span
        className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
        aria-hidden
      />
    ) : (
      leadingIcon
    )}
    {children}
    {!loading && trailingIcon}
  </button>
);
