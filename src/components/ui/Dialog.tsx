import React, { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../utils/format";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeOnBackdrop?: boolean;
}

const sizeMap = {
  sm: "max-w-[400px]",
  md: "max-w-[560px]",
  lg: "max-w-[720px]",
  xl: "max-w-[960px]",
};

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
}) => {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-hidden
      />
      <div
        className={cn(
          "relative w-full bg-[var(--surface-raised)]",
          "border border-[var(--hairline)] rounded-[12px] overflow-hidden",
          "shadow-[0_8px_16px_rgba(0,0,0,0.08),0_24px_64px_rgba(0,0,0,0.16)]",
          sizeMap[size]
        )}
      >
        {(title || description) && (
          <div className="px-6 py-4 border-b border-[var(--hairline)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {title && (
                  <h2 className="text-[16px] font-semibold text-[var(--text-primary)] tracking-tight">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="text-[13px] text-[var(--text-secondary)] mt-1">
                    {description}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 -mt-1 -mr-1 p-1.5 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-6 py-3 border-t border-[var(--hairline)] bg-[var(--surface-sunken)]/40 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
