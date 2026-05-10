export const DEFAULT_PAWN_ITEM_TYPES = ["Gold / Jewellery", "Electronic", "Other"];

const ITEM_TYPES_STORAGE_KEY = "pawnItemTypes";
const ITEM_DESCRIPTION_PRESETS_STORAGE_KEY = "pawnItemDescriptionPresets";
const ITEM_OVERDUE_THRESHOLDS_STORAGE_KEY = "pawnItemOverdueThresholds";
const CURRENT_EMPLOYEE_ID_KEY = "pawnCurrentEmployeeId";

export type PawnItemDescriptionPresets = Record<string, string[]>;
export type PawnItemOverdueThreshold = {
  months: number;
  days: number;
};
export type PawnItemOverdueThresholds = Record<string, PawnItemOverdueThreshold>;

export const getCurrentPawnEmployeeId = (): string | null => {
  const raw = window.sessionStorage.getItem(CURRENT_EMPLOYEE_ID_KEY);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
};

const getItemDescriptionPresetsStorageKey = (): string => {
  const employeeId = getCurrentPawnEmployeeId();
  return employeeId
    ? `${ITEM_DESCRIPTION_PRESETS_STORAGE_KEY}:${employeeId}`
    : ITEM_DESCRIPTION_PRESETS_STORAGE_KEY;
};

export const setCurrentPawnEmployeeId = (employeeId: string | number | null): void => {
  const normalized =
    employeeId == null ? "" : String(employeeId).trim();

  if (!normalized) {
    window.sessionStorage.removeItem(CURRENT_EMPLOYEE_ID_KEY);
    return;
  }

  window.sessionStorage.setItem(CURRENT_EMPLOYEE_ID_KEY, normalized);
};

export const normalizePawnItemTypes = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : DEFAULT_PAWN_ITEM_TYPES;
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized.length > 0 ? normalized : [...DEFAULT_PAWN_ITEM_TYPES];
};

export const loadPawnItemTypes = (): string[] => {
  const saved = window.localStorage.getItem(ITEM_TYPES_STORAGE_KEY);
  if (!saved) return [...DEFAULT_PAWN_ITEM_TYPES];

  try {
    return normalizePawnItemTypes(JSON.parse(saved));
  } catch {
    return [...DEFAULT_PAWN_ITEM_TYPES];
  }
};

export const savePawnItemTypes = (types: string[]): string[] => {
  const normalized = normalizePawnItemTypes(types);
  window.localStorage.setItem(ITEM_TYPES_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};

const normalizeOverdueThresholdPart = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
  }
  return Math.max(0, Math.floor(value));
};

const normalizeOverdueThresholdValue = (
  value: unknown
): PawnItemOverdueThreshold => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return {
      months: Math.max(0, Math.floor(value)),
      days: 0,
    };
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return {
      months: normalizeOverdueThresholdPart(record.months),
      days: normalizeOverdueThresholdPart(record.days),
    };
  }

  return {
    months: 0,
    days: 0,
  };
};

const normalizeDescriptionPresetList = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
};

export const normalizePawnItemDescriptionPresets = (
  value: unknown,
  itemTypes?: string[]
): PawnItemDescriptionPresets => {
  const normalizedItemTypes = normalizePawnItemTypes(itemTypes);
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const entries = new Map<string, string[]>();

  for (const [key, presets] of Object.entries(raw)) {
    if (typeof key !== "string") continue;
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    const normalizedPresets = normalizeDescriptionPresetList(presets);
    if (normalizedPresets.length === 0) continue;
    entries.set(trimmedKey.toLowerCase(), normalizedPresets);
  }

  const result: PawnItemDescriptionPresets = {};

  for (const itemType of normalizedItemTypes) {
    const presets = entries.get(itemType.toLowerCase()) ?? [];
    result[itemType] = presets;
  }

  for (const [normalizedKey, presets] of entries.entries()) {
    const alreadyIncluded = normalizedItemTypes.some(
      (itemType) => itemType.toLowerCase() === normalizedKey
    );
    if (alreadyIncluded) continue;
    const originalKey =
      Object.keys(raw).find((key) => key.trim().toLowerCase() === normalizedKey)?.trim() ??
      normalizedKey;
    result[originalKey] = presets;
  }

  return result;
};

export const loadPawnItemDescriptionPresets = (
  itemTypes?: string[]
): PawnItemDescriptionPresets => {
  const employeeScopedKey = getItemDescriptionPresetsStorageKey();
  const saved =
    window.localStorage.getItem(employeeScopedKey) ??
    window.localStorage.getItem(ITEM_DESCRIPTION_PRESETS_STORAGE_KEY);
  if (!saved) return normalizePawnItemDescriptionPresets({}, itemTypes);

  try {
    return normalizePawnItemDescriptionPresets(JSON.parse(saved), itemTypes);
  } catch {
    return normalizePawnItemDescriptionPresets({}, itemTypes);
  }
};

export const savePawnItemDescriptionPresets = (
  presets: PawnItemDescriptionPresets,
  itemTypes?: string[]
): PawnItemDescriptionPresets => {
  const normalized = normalizePawnItemDescriptionPresets(presets, itemTypes);
  window.localStorage.setItem(
    getItemDescriptionPresetsStorageKey(),
    JSON.stringify(normalized)
  );
  return normalized;
};

export const normalizePawnItemOverdueThresholds = (
  value: unknown,
  itemTypes?: string[]
): PawnItemOverdueThresholds => {
  const normalizedItemTypes = normalizePawnItemTypes(itemTypes);
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const entries = new Map<string, PawnItemOverdueThreshold>();

  for (const [key, threshold] of Object.entries(raw)) {
    if (typeof key !== "string") continue;
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    entries.set(trimmedKey.toLowerCase(), normalizeOverdueThresholdValue(threshold));
  }

  const result: PawnItemOverdueThresholds = {};

  for (const itemType of normalizedItemTypes) {
    result[itemType] = entries.get(itemType.toLowerCase()) ?? { months: 0, days: 0 };
  }

  for (const [normalizedKey, threshold] of entries.entries()) {
    const alreadyIncluded = normalizedItemTypes.some(
      (itemType) => itemType.toLowerCase() === normalizedKey
    );
    if (alreadyIncluded) continue;
    const originalKey =
      Object.keys(raw).find((key) => key.trim().toLowerCase() === normalizedKey)?.trim() ??
      normalizedKey;
    result[originalKey] = threshold;
  }

  return result;
};

export const loadPawnItemOverdueThresholds = (
  itemTypes?: string[]
): PawnItemOverdueThresholds => {
  const saved = window.localStorage.getItem(ITEM_OVERDUE_THRESHOLDS_STORAGE_KEY);
  if (!saved) return normalizePawnItemOverdueThresholds({}, itemTypes);

  try {
    return normalizePawnItemOverdueThresholds(JSON.parse(saved), itemTypes);
  } catch {
    return normalizePawnItemOverdueThresholds({}, itemTypes);
  }
};

export const savePawnItemOverdueThresholds = (
  thresholds: PawnItemOverdueThresholds,
  itemTypes?: string[]
): PawnItemOverdueThresholds => {
  const normalized = normalizePawnItemOverdueThresholds(thresholds, itemTypes);
  window.localStorage.setItem(
    ITEM_OVERDUE_THRESHOLDS_STORAGE_KEY,
    JSON.stringify(normalized)
  );
  return normalized;
};
