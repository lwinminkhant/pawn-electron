const DB_TIME_ZONE_STORAGE_KEY = "dbTimeZone";
const DEFAULT_DB_TIME_ZONE = "UTC";
const DAY_MS = 24 * 60 * 60 * 1000;

let cachedDbTimeZone: string | null = null;

type TimeZoneDateParts = {
  year: number;
  month: number;
  day: number;
};

const getFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

export const getConfiguredDbTimeZone = (): string => {
  if (cachedDbTimeZone) return cachedDbTimeZone;
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(DB_TIME_ZONE_STORAGE_KEY)?.trim();
    if (stored) {
      cachedDbTimeZone = stored;
      return stored;
    }
  }
  cachedDbTimeZone = DEFAULT_DB_TIME_ZONE;
  return cachedDbTimeZone;
};

export const setConfiguredDbTimeZone = (timeZone: string) => {
  const next = timeZone.trim() || DEFAULT_DB_TIME_ZONE;
  cachedDbTimeZone = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DB_TIME_ZONE_STORAGE_KEY, next);
  }
  return next;
};

export const getTimeZoneDateParts = (
  value: string | number | Date,
  timeZone = getConfiguredDbTimeZone()
): TimeZoneDateParts => {
  const date = value instanceof Date ? value : new Date(value);
  const parts = getFormatter(timeZone).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value || 0),
    month: Number(parts.find((part) => part.type === "month")?.value || 0),
    day: Number(parts.find((part) => part.type === "day")?.value || 0),
  };
};

export const getTimeZoneDayIndex = (
  value: string | number | Date,
  timeZone = getConfiguredDbTimeZone()
) => {
  const { year, month, day } = getTimeZoneDateParts(value, timeZone);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
};

export const getCalendarDaysDue = (
  from: string | number | Date,
  to: string | number | Date = new Date(),
  timeZone = getConfiguredDbTimeZone()
) => Math.max(0, getTimeZoneDayIndex(to, timeZone) - getTimeZoneDayIndex(from, timeZone));

export const addCalendarDays = (
  value: string | number | Date,
  days: number,
  timeZone = getConfiguredDbTimeZone()
) => {
  const { year, month, day } = getTimeZoneDateParts(value, timeZone);
  return new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0, 0));
};
