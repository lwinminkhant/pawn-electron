import React, { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getStoredTheme, setTheme, type Theme } from "../../utils/theme";
import { cn } from "../../utils/format";

interface ThemeToggleProps {
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className }) => {
  const [theme, setState] = useState<Theme>(() => getStoredTheme());

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    setState(next);
  };

  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      className={cn(
        "inline-flex items-center justify-center w-9 h-9 rounded-[6px]",
        "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
        "hover:bg-[var(--surface-hover)] transition-colors",
        className
      )}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
};
