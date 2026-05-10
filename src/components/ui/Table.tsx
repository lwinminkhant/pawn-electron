import React from "react";
import { cn } from "../../utils/format";

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({
  className,
  children,
  ...rest
}) => (
  <div className="w-full overflow-x-auto">
    <table
      {...rest}
      className={cn(
        "w-full border-collapse text-[14px] text-[var(--text-primary)]",
        className
      )}
    >
      {children}
    </table>
  </div>
);

export const THead: React.FC<
  React.HTMLAttributes<HTMLTableSectionElement>
> = ({ className, children, ...rest }) => (
  <thead
    {...rest}
    className={cn(
      "bg-[var(--surface-sunken)]/60 border-b border-[var(--hairline)]",
      className
    )}
  >
    {children}
  </thead>
);

export const TBody: React.FC<
  React.HTMLAttributes<HTMLTableSectionElement>
> = ({ className, children, ...rest }) => (
  <tbody
    {...rest}
    className={cn("divide-y divide-[var(--hairline)]", className)}
  >
    {children}
  </tbody>
);

export const TR: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  className,
  children,
  ...rest
}) => (
  <tr
    {...rest}
    className={cn(
      "transition-colors duration-100 hover:bg-[var(--surface-hover)]",
      className
    )}
  >
    {children}
  </tr>
);

interface ThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "right" | "center";
}

export const TH: React.FC<ThProps> = ({
  align = "left",
  className,
  children,
  ...rest
}) => (
  <th
    {...rest}
    className={cn(
      "px-4 py-2.5 font-medium eyebrow whitespace-nowrap",
      align === "right" && "text-right",
      align === "center" && "text-center",
      align === "left" && "text-left",
      className
    )}
  >
    {children}
  </th>
);

interface TdProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "right" | "center";
  mono?: boolean;
  muted?: boolean;
}

export const TD: React.FC<TdProps> = ({
  align = "left",
  mono,
  muted,
  className,
  children,
  ...rest
}) => (
  <td
    {...rest}
    className={cn(
      "px-4 py-3",
      align === "right" && "text-right",
      align === "center" && "text-center",
      mono && "mono",
      muted && "text-[var(--text-secondary)]",
      className
    )}
  >
    {children}
  </td>
);
