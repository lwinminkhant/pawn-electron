import { useSyncExternalStore } from "react";
import { getConfiguredDbTimeZone, getTimeZoneDateParts } from "./timeZone";

const BUSINESS_DATE_STORAGE_KEY = "businessDateYmd";
const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const listeners = new Set<() => void>();

const formatYmd = (date: Date) => {
  const { year, month, day } = getTimeZoneDateParts(
    date,
    getConfiguredDbTimeZone(),
  );
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}`;
};

const getFallbackBusinessDateYmd = () => formatYmd(new Date());

const emitChange = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const isValidBusinessDateYmd = (value: string) =>
  BUSINESS_DATE_PATTERN.test(value.trim());

export const getCurrentBusinessDateYmd = () => {
  if (typeof window === "undefined") {
    return getFallbackBusinessDateYmd();
  }

  const stored = window.localStorage.getItem(BUSINESS_DATE_STORAGE_KEY)?.trim();
  if (stored && isValidBusinessDateYmd(stored)) {
    return stored;
  }
  return getFallbackBusinessDateYmd();
};

export const getCurrentBusinessDate = () => {
  const [year, month, day] = getCurrentBusinessDateYmd().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
};

export const setCurrentBusinessDateYmd = (value: string) => {
  const normalized = value.trim();
  const nextValue = isValidBusinessDateYmd(normalized)
    ? normalized
    : getFallbackBusinessDateYmd();

  if (typeof window !== "undefined") {
    window.localStorage.setItem(BUSINESS_DATE_STORAGE_KEY, nextValue);
  }

  emitChange();
  return nextValue;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === BUSINESS_DATE_STORAGE_KEY) {
      listener();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
};

export const useBusinessDate = () =>
  useSyncExternalStore(
    subscribe,
    getCurrentBusinessDateYmd,
    getFallbackBusinessDateYmd,
  );
