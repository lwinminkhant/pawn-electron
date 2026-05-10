import {
  getConfiguredDbTimeZone,
  getTimeZoneDateParts,
} from "./timeZone";
import { getCurrentBusinessDate } from "./businessDate";

const MMK_FORMATTER = new Intl.NumberFormat("en-US");
const DEFAULT_ONE_KYAT_IN_GRAMS = 16.606;

export function formatMMK(amount: number | null | undefined): string {
  const n = Number(amount ?? 0);
  return `${MMK_FORMATTER.format(Math.round(n))} MMK`;
}

export function formatNumber(amount: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

export function formatDecimal(
  amount: number | null | undefined,
  maximumFractionDigits = 2
): string {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(n);
}

export function formatWeight(
  amount: number | null | undefined,
  maximumFractionDigits = 2
): string {
  return formatDecimal(amount, maximumFractionDigits);
}

function getOneKyatInGrams(): number {
  if (typeof window === "undefined") return DEFAULT_ONE_KYAT_IN_GRAMS;
  const raw = window.localStorage.getItem("oneKyatInGrams");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_ONE_KYAT_IN_GRAMS;
}

export function formatMyanmarWeight(amount: number | null | undefined): string {
  const grams = Number(amount ?? 0);
  const standard = getOneKyatInGrams();

  if (!Number.isFinite(grams) || grams <= 0 || !Number.isFinite(standard) || standard <= 0) {
    return "0ကျပ် 0ပဲ 0ရွေး";
  }

  const totalYway = Math.round((grams / standard) * 128);
  const kyat = Math.floor(totalYway / 128);
  const pe = Math.floor((totalYway % 128) / 8);
  const yway = totalYway % 8;

  return `${kyat}ကျပ် ${pe}ပဲ ${yway}ရွေး`;
}

export function formatCompactMMK(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000)
    return `${(amount / 1_000_000_000).toFixed(1)}B MMK`;
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M MMK`;
  if (abs >= 1_000) return `${(amount / 1_000).toFixed(1)}K MMK`;
  return formatMMK(amount);
}

/** `YYYY-MM-DD` in the local calendar (matches `<input type="date">`). */
export function localCalendarDateYmd(d: Date = getCurrentBusinessDate()): string {
  const { year, month, day } = getTimeZoneDateParts(
    d,
    getConfiguredDbTimeZone()
  );
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", {
    timeZone: getConfiguredDbTimeZone(),
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-US", {
    timeZone: getConfiguredDbTimeZone(),
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const now = getCurrentBusinessDate();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", {
    timeZone: getConfiguredDbTimeZone(),
    month: "short",
    day: "numeric",
  });
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
