import React from "react";
import { formatMMK, formatNumber, cn } from "../../utils/format";

interface MoneyProps extends React.HTMLAttributes<HTMLSpanElement> {
  amount: number | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "default" | "muted" | "success" | "danger" | "brass";
  strong?: boolean;
  signed?: boolean;
}

const sizeMap = {
  sm: "text-[12px]",
  md: "text-[14px]",
  lg: "text-[16px]",
  xl: "text-[20px]",
};

const toneMap = {
  default: "text-[var(--text-primary)]",
  muted: "text-[var(--text-secondary)]",
  success: "text-[var(--success)]",
  danger: "text-[var(--danger)]",
  brass: "text-[var(--brass)]",
};

export const Money: React.FC<MoneyProps> = ({
  amount,
  size = "md",
  tone = "default",
  strong = true,
  signed = false,
  className,
  ...rest
}) => {
  const n = Number(amount ?? 0);
  const formatted = formatMMK(Math.abs(n));
  const sign = signed && n !== 0 ? (n > 0 ? "+" : "−") : "";
  const number = formatted.replace(" MMK", "");

  return (
    <span
      {...rest}
      className={cn(
        "mono inline-flex items-baseline gap-1",
        sizeMap[size],
        toneMap[tone],
        strong && "font-semibold",
        className
      )}
    >
      <span>
        {sign}
        {number}
      </span>
      <span className="text-[var(--text-muted)] font-normal text-[0.75em]">
        MMK
      </span>
    </span>
  );
};

/* Plain tabular-mono number (weight, count, etc.) */
interface NumProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number;
  fractionDigits?: number;
  unit?: string;
}

export const Num: React.FC<NumProps> = ({
  value,
  fractionDigits = 0,
  unit,
  className,
  ...rest
}) => (
  <span {...rest} className={cn("mono", className)}>
    {formatNumber(value, fractionDigits)}
    {unit && (
      <span className="text-[var(--text-muted)] font-normal ml-1 text-[0.85em]">
        {unit}
      </span>
    )}
  </span>
);
