import {
  DEFAULT_PAWN_ITEM_TYPES,
  loadPawnItemTypes,
  normalizePawnItemDescriptionPresets,
  normalizePawnItemOverdueThresholds,
  normalizePawnItemTypes,
  type PawnItemDescriptionPresets,
  type PawnItemOverdueThresholds,
} from "./itemTypes";
import { setBusinessDateChangeEnabled } from "./businessDate";
import { setConfiguredDbTimeZone } from "./timeZone";

const INTEREST_TIERS_KEY = "interestTiers";
const INTEREST_TIERS_BY_ITEM_TYPE_KEY = "interestTiersByItemType";
const GOLD_RATE_KEY = "goldRate";
const ONE_KYAT_IN_GRAMS_KEY = "oneKyatInGrams";
const GOLD_PRICE_PER_KYAT_KEY = "goldPricePerKyat";
const FACE_CAMERA_KEY = "preferredFaceCameraId";
const TICKET_CAMERA_KEY = "preferredTicketCameraId";
const ITEM_TYPES_KEY = "pawnItemTypes";
const ITEM_DESCRIPTION_PRESETS_KEY = "pawnItemDescriptionPresets";
const ITEM_OVERDUE_THRESHOLDS_KEY = "pawnItemOverdueThresholds";

export type InterestTier = {
  minAmount: number;
  rate: number;
};

export type InterestTierByItemType = Record<string, InterestTier[]>;

export type AppSettingsPayload = {
  interestTiers: InterestTier[];
  interestTiersByItemType: InterestTierByItemType;
  goldRate: string;
  oneKyatInGrams: string;
  goldPricePerKyat: string;
  itemTypes: string[];
  itemDescriptionPresets: PawnItemDescriptionPresets;
  itemOverdueThresholds: PawnItemOverdueThresholds;
  businessDateChangeEnabled: boolean;
  faceCameraId: string;
  ticketCameraId: string;
  dbTimeZone: string;
};

export const DEFAULT_INTEREST_TIERS: InterestTier[] = [
  { minAmount: 0, rate: 3 },
  { minAmount: 500001, rate: 2.5 },
  { minAmount: 1000001, rate: 2 },
];

export const DEFAULT_APP_SETTINGS: AppSettingsPayload = {
  interestTiers: DEFAULT_INTEREST_TIERS,
  interestTiersByItemType: Object.fromEntries(
    DEFAULT_PAWN_ITEM_TYPES.map((itemType) => [itemType, [...DEFAULT_INTEREST_TIERS]]),
  ),
  goldRate: "80000",
  oneKyatInGrams: "16.606",
  goldPricePerKyat: "",
  itemTypes: [...DEFAULT_PAWN_ITEM_TYPES],
  itemDescriptionPresets: normalizePawnItemDescriptionPresets(
    {},
    DEFAULT_PAWN_ITEM_TYPES,
  ),
  itemOverdueThresholds: normalizePawnItemOverdueThresholds(
    {},
    DEFAULT_PAWN_ITEM_TYPES,
  ),
  businessDateChangeEnabled: true,
  faceCameraId: "",
  ticketCameraId: "",
  dbTimeZone: "UTC",
};

const normalizeInterestTier = (value: unknown): InterestTier | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const minAmount = Number(record.minAmount);
  const rate = Number(record.rate);
  if (!Number.isFinite(minAmount) || !Number.isFinite(rate)) return null;
  return {
    minAmount: Math.max(0, Math.floor(minAmount)),
    rate: Math.max(0, rate),
  };
};

const normalizeInterestTiers = (value: unknown): InterestTier[] => {
  const raw = Array.isArray(value) ? value : DEFAULT_INTEREST_TIERS;
  const normalized = raw
    .map(normalizeInterestTier)
    .filter((tier): tier is InterestTier => tier != null)
    .sort((a, b) => a.minAmount - b.minAmount);
  return normalized.length > 0 ? normalized : [...DEFAULT_INTEREST_TIERS];
};

const normalizeInterestTiersByItemType = (
  value: unknown,
  itemTypes: string[],
  fallbackTiers: InterestTier[],
): InterestTierByItemType => {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const entries = new Map<string, InterestTier[]>();

  for (const [key, tiers] of Object.entries(raw)) {
    if (typeof key !== "string") continue;
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    entries.set(trimmedKey.toLowerCase(), normalizeInterestTiers(tiers));
  }

  const result: InterestTierByItemType = {};

  for (const itemType of itemTypes) {
    result[itemType] = entries.get(itemType.toLowerCase()) ?? [...fallbackTiers];
  }

  for (const [normalizedKey, tiers] of entries.entries()) {
    const alreadyIncluded = itemTypes.some(
      (itemType) => itemType.toLowerCase() === normalizedKey,
    );
    if (alreadyIncluded) continue;
    const originalKey =
      Object.keys(raw).find((key) => key.trim().toLowerCase() === normalizedKey)?.trim() ??
      normalizedKey;
    result[originalKey] = tiers;
  }

  return result;
};

const normalizeString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const normalizeBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return fallback;
};

export const normalizeAppSettings = (
  value: unknown,
): AppSettingsPayload => {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const itemTypes = normalizePawnItemTypes(raw.itemTypes);
  const interestTiers = normalizeInterestTiers(raw.interestTiers);
  const goldRate = normalizeString(raw.goldRate, DEFAULT_APP_SETTINGS.goldRate);
  const oneKyatInGrams = normalizeString(
    raw.oneKyatInGrams,
    DEFAULT_APP_SETTINGS.oneKyatInGrams,
  );
  const goldPricePerKyat =
    normalizeString(raw.goldPricePerKyat) ||
    (() => {
      const rate = Number(goldRate);
      const standard = Number(oneKyatInGrams);
      return Number.isFinite(rate) && Number.isFinite(standard)
        ? String(Math.round(rate * standard))
        : "";
    })();

  return {
    interestTiers,
    interestTiersByItemType: normalizeInterestTiersByItemType(
      raw.interestTiersByItemType,
      itemTypes,
      interestTiers,
    ),
    goldRate,
    oneKyatInGrams,
    goldPricePerKyat,
    itemTypes,
    itemDescriptionPresets: normalizePawnItemDescriptionPresets(
      raw.itemDescriptionPresets,
      itemTypes,
    ),
    itemOverdueThresholds: normalizePawnItemOverdueThresholds(
      raw.itemOverdueThresholds,
      itemTypes,
    ),
    businessDateChangeEnabled: normalizeBoolean(
      raw.businessDateChangeEnabled,
      DEFAULT_APP_SETTINGS.businessDateChangeEnabled,
    ),
    faceCameraId: normalizeString(raw.faceCameraId),
    ticketCameraId: normalizeString(raw.ticketCameraId),
    dbTimeZone: normalizeString(raw.dbTimeZone, DEFAULT_APP_SETTINGS.dbTimeZone),
  };
};

export const syncAppSettingsToLocalCache = (settings: AppSettingsPayload) => {
  window.localStorage.setItem(
    INTEREST_TIERS_KEY,
    JSON.stringify(settings.interestTiers),
  );
  window.localStorage.setItem(
    INTEREST_TIERS_BY_ITEM_TYPE_KEY,
    JSON.stringify(settings.interestTiersByItemType),
  );
  window.localStorage.setItem(GOLD_RATE_KEY, settings.goldRate);
  window.localStorage.setItem(ONE_KYAT_IN_GRAMS_KEY, settings.oneKyatInGrams);
  window.localStorage.setItem(
    GOLD_PRICE_PER_KYAT_KEY,
    settings.goldPricePerKyat,
  );
  window.localStorage.setItem(ITEM_TYPES_KEY, JSON.stringify(settings.itemTypes));
  window.localStorage.setItem(
    ITEM_DESCRIPTION_PRESETS_KEY,
    JSON.stringify(settings.itemDescriptionPresets),
  );
  window.localStorage.setItem(
    ITEM_OVERDUE_THRESHOLDS_KEY,
    JSON.stringify(settings.itemOverdueThresholds),
  );
  setBusinessDateChangeEnabled(settings.businessDateChangeEnabled);

  if (settings.faceCameraId) {
    window.localStorage.setItem(FACE_CAMERA_KEY, settings.faceCameraId);
  } else {
    window.localStorage.removeItem(FACE_CAMERA_KEY);
  }

  if (settings.ticketCameraId) {
    window.localStorage.setItem(TICKET_CAMERA_KEY, settings.ticketCameraId);
  } else {
    window.localStorage.removeItem(TICKET_CAMERA_KEY);
  }

  window.localStorage.removeItem("overdueDefaultMonths");
  window.localStorage.removeItem("overdueDefaultDays");
  setConfiguredDbTimeZone(settings.dbTimeZone);
  window.dispatchEvent(new Event("pawn-item-types-updated"));
};

export const loadInterestTiersForItemType = (itemType: string): InterestTier[] => {
  const normalizedItemTypes = normalizePawnItemTypes(loadPawnItemTypes());
  const savedGlobalTiers = window.localStorage.getItem(INTEREST_TIERS_KEY);
  let fallbackTiers = [...DEFAULT_INTEREST_TIERS];
  if (savedGlobalTiers) {
    try {
      fallbackTiers = normalizeInterestTiers(JSON.parse(savedGlobalTiers));
    } catch {
      fallbackTiers = [...DEFAULT_INTEREST_TIERS];
    }
  }
  const savedByItemType = window.localStorage.getItem(INTEREST_TIERS_BY_ITEM_TYPE_KEY);

  if (!savedByItemType) {
    return [...fallbackTiers];
  }

  try {
    const normalized = normalizeInterestTiersByItemType(
      JSON.parse(savedByItemType),
      normalizedItemTypes,
      fallbackTiers,
    );

    const match = Object.entries(normalized).find(
      ([key]) => key.trim().toLowerCase() === itemType.trim().toLowerCase(),
    );
    return [...(match?.[1] ?? fallbackTiers)];
  } catch {
    return [...fallbackTiers];
  }
};
