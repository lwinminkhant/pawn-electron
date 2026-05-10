export const GOLD_JEWELLERY_ITEM_TYPE = 'Gold / Jewellery';
const TRAYS_PER_BOX = 6;
const BOXES_PER_TRAY = 2;
const POSITIONS_PER_BOX = 15;
const CYCLE_CAPACITY = TRAYS_PER_BOX * BOXES_PER_TRAY * POSITIONS_PER_BOX;
const STORAGE_PART_PATTERN = /^([BTP])(\d+)$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
const STORAGE_CYCLE_REFERENCE_DAY_INDEX = Math.floor(Date.UTC(2026, 0, 1) / DAY_MS);
export function usesGoldJewelleryStorage(itemType) {
    return itemType?.trim().toLowerCase() === GOLD_JEWELLERY_ITEM_TYPE.toLowerCase();
}
export function getMonthCycleTray(date) {
    return (date.getMonth() % TRAYS_PER_BOX) + 1;
}
export function normalizeStorageLocation(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const parts = trimmed.split('-').map((part) => part.trim()).filter(Boolean);
    if (parts.length !== 3)
        return trimmed;
    const partMap = {};
    for (const part of parts) {
        const match = STORAGE_PART_PATTERN.exec(part);
        if (!match)
            return trimmed;
        partMap[match[1].toUpperCase()] = match[2];
    }
    if (!partMap.T || !partMap.B || !partMap.P)
        return trimmed;
    return `T${partMap.T}-B${partMap.B}-P${partMap.P}`;
}
const getCalendarDayIndex = (date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
export function getStoragePlacementForDate(date) {
    const elapsedDays = getCalendarDayIndex(date) - STORAGE_CYCLE_REFERENCE_DAY_INDEX;
    const normalizedElapsedDays = ((elapsedDays % CYCLE_CAPACITY) + CYCLE_CAPACITY) % CYCLE_CAPACITY;
    const slotNumber = normalizedElapsedDays + 1;
    const storageBlockIndex = Math.floor(normalizedElapsedDays / POSITIONS_PER_BOX);
    const trayNumber = Math.floor(storageBlockIndex / BOXES_PER_TRAY) + 1;
    const boxNumber = (storageBlockIndex % BOXES_PER_TRAY) + 1;
    const positionNumber = (normalizedElapsedDays % POSITIONS_PER_BOX) + 1;
    const storageLocation = normalizeStorageLocation(`T${trayNumber}-B${boxNumber}-P${positionNumber}`) ||
        `T${trayNumber}-B${boxNumber}-P${positionNumber}`;
    return {
        boxNumber,
        trayNumber,
        positionNumber,
        slotNumber,
        storageLocation,
    };
}
export function getStorageInfo(currentDate, existingCountForDate) {
    const dayOfMonth = currentDate.getDate();
    const sequence = existingCountForDate + 1;
    const { boxNumber, trayNumber, positionNumber, slotNumber, storageLocation, } = getStoragePlacementForDate(currentDate);
    return {
        boxNumber,
        trayNumber,
        dayOfMonth,
        existingCount: existingCountForDate,
        sequence,
        positionNumber,
        storageLocation,
        slotNumber,
    };
}
//# sourceMappingURL=storageUtils.js.map