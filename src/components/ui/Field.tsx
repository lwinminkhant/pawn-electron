import React from "react";
import { Search } from "lucide-react";
import { cn } from "../../utils/format";

/* ---------- Field wrapper ---------- */

interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}

export const Field: React.FC<FieldProps> = ({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}) => (
  <div className={cn("flex flex-col gap-1.5", className)}>
    {label && (
      <label
        htmlFor={htmlFor}
        className="text-[12px] font-medium text-[var(--text-secondary)]"
      >
        {label}
        {required && (
          <span className="text-[var(--danger)] ml-0.5" aria-hidden>
            *
          </span>
        )}
      </label>
    )}
    {children}
    {error ? (
      <p className="text-[12px] text-[var(--danger)]">{error}</p>
    ) : hint ? (
      <p className="text-[12px] text-[var(--text-muted)]">{hint}</p>
    ) : null}
  </div>
);

/* ---------- Input base styles ---------- */

const inputBase =
  "w-full h-10 px-3 text-[14px] " +
  "bg-[var(--surface-raised)] text-[var(--text-primary)] " +
  "border border-[var(--hairline)] rounded-[6px] " +
  "placeholder:text-[var(--text-muted)] " +
  "transition-colors duration-150 " +
  "hover:border-[var(--hairline-strong)] " +
  "focus:border-[var(--brass)] focus:ring-2 focus:ring-[var(--brass-soft)] " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

/* ---------- Input ---------- */

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { monoDigits?: boolean }
>(({ className, monoDigits, ...rest }, ref) => (
  <input
    ref={ref}
    {...rest}
    className={cn(inputBase, monoDigits && "mono", className)}
  />
));
Input.displayName = "Input";

/* ---------- Textarea ---------- */

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 3, ...rest }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    {...rest}
    className={cn(
      inputBase,
      "h-auto py-2 leading-relaxed resize-y min-h-[72px]",
      className
    )}
  />
));
Textarea.displayName = "Textarea";

/* ---------- Select (native, themed) ---------- */

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...rest }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      {...rest}
      className={cn(
        inputBase,
        "appearance-none pr-9 cursor-pointer",
        className
      )}
    >
      {children}
    </select>
    <svg
      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </div>
));
Select.displayName = "Select";

/* ---------- Search input ---------- */

export const SearchInput: React.FC<
  React.InputHTMLAttributes<HTMLInputElement>
> = ({ className, ...rest }) => (
  <div className="relative">
    <Search
      size={15}
      className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
      aria-hidden
    />
    <input
      {...rest}
      type={rest.type ?? "search"}
      className={cn(inputBase, "pl-9", className)}
    />
  </div>
);
