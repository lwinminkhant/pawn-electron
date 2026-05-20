import { useSyncExternalStore } from "react";
import { getConfiguredDbTimeZone, getTimeZoneDateParts } from "./timeZone";

const BUSINESS_DATE_STORAGE_KEY = "businessDateYmd";
const BUSINESS_DATE_CHANGE_ENABLED_STORAGE_KEY = "businessDateChangeEnabled";
const DATABASE_CURRENT_DATE_STORAGE_KEY = "databaseCurrentDateYmd";
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

const getStoredDatabaseCurrentDateYmd = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(DATABASE_CURRENT_DATE_STORAGE_KEY)?.trim();
  if (stored && isValidBusinessDateYmd(stored)) {
    return stored;
  }
  return null;
};

const emitChange = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const isValidBusinessDateYmd = (value: string) =>
  BUSINESS_DATE_PATTERN.test(value.trim());

export const getBusinessDateChangeEnabled = () => {
  if (typeof window === "undefined") {
    return true;
  }

  const stored = window.localStorage
    .getItem(BUSINESS_DATE_CHANGE_ENABLED_STORAGE_KEY)
    ?.trim()
    .toLowerCase();

  return stored !== "0" && stored !== "false";
};

export const getCurrentBusinessDateYmd = () => {
  if (typeof window === "undefined") {
    return getFallbackBusinessDateYmd();
  }

  if (!getBusinessDateChangeEnabled()) {
    return getStoredDatabaseCurrentDateYmd() ?? getFallbackBusinessDateYmd();
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
  if (!getBusinessDateChangeEnabled()) {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(BUSINESS_DATE_STORAGE_KEY);
    }
    const fallback = getFallbackBusinessDateYmd();
    emitChange();
    return fallback;
  }

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

export const setBusinessDateChangeEnabled = (enabled: boolean) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      BUSINESS_DATE_CHANGE_ENABLED_STORAGE_KEY,
      enabled ? "1" : "0",
    );
    if (!enabled) {
      window.localStorage.removeItem(BUSINESS_DATE_STORAGE_KEY);
    }
  }

  emitChange();
  return enabled;
};

export const setDatabaseCurrentDateYmd = (value: string) => {
  const normalized = value.trim();
  if (typeof window !== "undefined") {
    if (isValidBusinessDateYmd(normalized)) {
      window.localStorage.setItem(DATABASE_CURRENT_DATE_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(DATABASE_CURRENT_DATE_STORAGE_KEY);
    }
  }

  emitChange();
  return isValidBusinessDateYmd(normalized) ? normalized : null;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (
      event.key === BUSINESS_DATE_STORAGE_KEY ||
      event.key === BUSINESS_DATE_CHANGE_ENABLED_STORAGE_KEY ||
      event.key === DATABASE_CURRENT_DATE_STORAGE_KEY
    ) {
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

export const useBusinessDateChangeEnabled = () =>
  useSyncExternalStore(subscribe, getBusinessDateChangeEnabled, () => true);
