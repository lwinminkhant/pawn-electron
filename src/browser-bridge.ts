import { getCurrentBusinessDateYmd } from './utils/businessDate';
import { localCalendarDateYmd } from './utils/format';
import { getCurrentPawnEmployeeId } from './utils/itemTypes';
import {
    getStoragePlacementForDate,
    normalizeStorageLocation,
    usesGoldJewelleryStorage,
} from './utils/storageUtils';

const getApiBaseUrl = () => {
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        return 'http://localhost:8787';
    }
    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
    }
    if (typeof window !== 'undefined') {
        const { protocol, hostname } = window.location;
        if ((protocol === 'http:' || protocol === 'https:') && hostname && hostname !== 'localhost') {
            return `${protocol}//${hostname}:8787`;
        }
    }
    return 'http://localhost:8787';
};

const API_BASE_URL = getApiBaseUrl();
const LOCAL_API_BASE_URL = 'http://localhost:8787';

type AnyRecord = Record<string, unknown>;

const fetchJson = async (baseUrl: string, path: string, init?: RequestInit) => {
    const res = await fetch(`${baseUrl}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
            'x-business-date': getCurrentBusinessDateYmd(),
            ...(init?.headers || {}),
        },
        ...init,
    });
    const raw = await res.text();
    let payload: AnyRecord = {};
    if (raw) {
        try {
            payload = JSON.parse(raw);
        } catch {
            payload = {
                success: false,
                message: raw.includes('Cannot ')
                    ? raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
                    : 'Invalid server response',
            };
        }
    }
    if (!res.ok) {
        if (payload && Object.keys(payload).length > 0) {
            return { success: false, ...payload };
        }
        return { success: false, message: `Request failed (${res.status} ${res.statusText})` };
    }
    return payload;
};

const httpJson = async (path: string, init?: RequestInit) => {
    try {
        return await fetchJson(API_BASE_URL, path, init);
    } catch (error) {
        const shouldRetryLocal =
            API_BASE_URL !== LOCAL_API_BASE_URL &&
            typeof window !== 'undefined' &&
            window.location.protocol === 'file:';
        if (shouldRetryLocal) {
            return fetchJson(LOCAL_API_BASE_URL, path, init);
        }
        throw error;
    }
};

const normalizeStorageValue = (value: unknown) => {
    if (typeof value !== 'string') return value ?? null;
    const normalized = normalizeStorageLocation(value);
    if (normalized) return normalized;
    const trimmed = value.trim();
    return trimmed || null;
};

const normalizeStorageInfo = (storageInfo: AnyRecord) => ({
    ...storageInfo,
    storageLocation: normalizeStorageValue(storageInfo.storageLocation),
});

const getRecordItemType = (record: AnyRecord) =>
    (record.itemType as string) || ((record.item as AnyRecord | undefined)?.type as string) || '';

const resolveStorageLocation = (record: AnyRecord) => {
    if (!usesGoldJewelleryStorage(getRecordItemType(record))) return null;

    const createdAt = record.createdAt;
    if (typeof createdAt === 'string' || createdAt instanceof Date) {
        return getStoragePlacementForDate(new Date(createdAt)).storageLocation;
    }
    return normalizeStorageValue(record.storageLocation);
};

const normalizePawn = (pawn: AnyRecord) => {
    const itemType = getRecordItemType(pawn);
    const usesStorage = usesGoldJewelleryStorage(itemType);
    return {
        ...pawn,
        physicalNumber: usesStorage ? null : pawn.physicalNumber,
        storageLocation: resolveStorageLocation(pawn),
        item: {
            type: itemType || 'Unknown',
            description:
                (pawn.itemDescription as string) ||
                ((pawn.item as AnyRecord | undefined)?.description as string) ||
                '',
            photo:
                (pawn.itemPhoto as string) ||
                ((pawn.item as AnyRecord | undefined)?.photo as string) ||
                undefined,
            weight: usesStorage ? Number(pawn.weight || (pawn.item as AnyRecord | undefined)?.weight || 0) : 0,
            netWeight:
                usesStorage && pawn.netWeight != null
                    ? Number(pawn.netWeight)
                    : usesStorage && (pawn.item as AnyRecord | undefined)?.netWeight != null
                      ? Number((pawn.item as AnyRecord).netWeight)
                      : undefined,
        },
    };
};

const withCurrentEmployeeId = (data?: AnyRecord) => {
    const employeeId = getCurrentPawnEmployeeId();
    if (!employeeId) return { ...(data || {}) };
    return { ...(data || {}), employeeId: Number(employeeId) };
};

export const initializeBrowserBridge = () => {
    if (typeof window === 'undefined') return;

    const invoke = async (channel: string, data?: AnyRecord) => {
        switch (channel) {
            case 'login':
                return httpJson('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify(data || {}),
                });

            case 'list-pawns': {
                const status = data?.status ? `?status=${encodeURIComponent(String(data.status))}` : '';
                const result = await httpJson(`/pawns${status}`);
                if (result?.success && Array.isArray(result.pawns)) {
                    return { ...result, pawns: result.pawns.map(normalizePawn) };
                }
                return result;
            }

            case 'get-pawn': {
                const pawnId = Number(data?.id ?? data?.pawnId);
                const includeInactive = data?.includeInactive === true;
                if (!Number.isFinite(pawnId) || pawnId <= 0) {
                    return { success: false, message: 'Invalid pawn id' };
                }
                const result = await httpJson(
                    `/pawns/${pawnId}${includeInactive ? '?includeInactive=true' : ''}`,
                );
                if (result?.success && result.pawn) {
                    return { ...result, pawn: normalizePawn(result.pawn as AnyRecord) };
                }
                // Older API builds may lack GET /pawns/:id support for inactive tickets.
                const routeMissing =
                    typeof result?.message === 'string' && /Cannot GET/i.test(result.message);
                const inactiveBlocked =
                    includeInactive &&
                    typeof result?.message === 'string' &&
                    /not active/i.test(result.message);
                if (routeMissing || inactiveBlocked) {
                    const fromList = await httpJson('/pawns');
                    if (fromList?.success && Array.isArray(fromList.pawns)) {
                        const row = (fromList.pawns as AnyRecord[]).find(
                            (p) => Number(p.id) === pawnId,
                        );
                        if (!row) {
                            return { success: false, message: `Ticket #${pawnId} not found` };
                        }
                        if (!includeInactive && row.status !== 'PAWN') {
                            return { success: false, message: 'Ticket is not active' };
                        }
                        return { success: true, pawn: normalizePawn(row) };
                    }
                    return { success: false, message: `Ticket #${pawnId} not found` };
                }
                return result;
            }

            case 'create-pawn': {
                const result = await httpJson('/pawns', {
                    method: 'POST',
                    body: JSON.stringify(withCurrentEmployeeId(data)),
                });
                if (result?.success && result.storageInfo) {
                    return {
                        ...result,
                        storageInfo: normalizeStorageInfo(result.storageInfo as AnyRecord),
                    };
                }
                return result;
            }

            case 'pay-interest': {
                const pawnId = Number(data?.pawnId);
                if (!Number.isFinite(pawnId)) return { success: false, message: 'Invalid pawn id' };
                return httpJson(`/pawns/${pawnId}/pay-interest`, {
                    method: 'POST',
                    body: JSON.stringify(withCurrentEmployeeId({
                        daysToPay: data?.daysToPay,
                        amount: data?.amount,
                    })),
                });
            }

            case 'adjust-pawn-amount': {
                const pawnId = Number(data?.pawnId);
                if (!Number.isFinite(pawnId)) return { success: false, message: 'Invalid pawn id' };
                return httpJson(`/pawns/${pawnId}/adjust`, {
                    method: 'POST',
                    body: JSON.stringify(withCurrentEmployeeId({
                        amount: data?.amount,
                        adjustmentType: data?.adjustmentType,
                    })),
                });
            }

            case 'update-pawn-note': {
                const pawnId = Number(data?.pawnId);
                if (!Number.isFinite(pawnId)) return { success: false, message: 'Invalid pawn id' };
                return httpJson(`/pawns/${pawnId}/note`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        note: typeof data?.note === 'string' ? data.note : '',
                    }),
                });
            }

            case 'batch-pay-interest': {
                const tickets = Array.isArray(data?.tickets)
                    ? data.tickets.map((ticket) => ({
                        pawnId: Number((ticket as AnyRecord).pawnId),
                        daysToPay: Number((ticket as AnyRecord).daysToPay),
                        amount: Number((ticket as AnyRecord).amount),
                    }))
                    : [];
                return httpJson('/pawns/batch/pay-interest', {
                    method: 'POST',
                    body: JSON.stringify(withCurrentEmployeeId({ tickets })),
                });
            }

            case 'batch-expire': {
                const pawnIds = Array.isArray(data?.pawnIds)
                    ? data.pawnIds.map((pawnId) => Number(pawnId)).filter((pawnId) => Number.isFinite(pawnId))
                    : [];
                return httpJson('/pawns/batch/expire', {
                    method: 'POST',
                    body: JSON.stringify({ pawnIds }),
                });
            }

            case 'redeem-pawn': {
                const pawnId = Number(data?.pawnId);
                if (!Number.isFinite(pawnId)) return { success: false, message: 'Invalid pawn id' };
                return httpJson(`/pawns/${pawnId}/redeem`, {
                    method: 'POST',
                    body: JSON.stringify(withCurrentEmployeeId({
                        totalAmount: data?.totalAmount,
                        discountAmount: data?.discountAmount ?? 0,
                    })),
                });
            }

            case 'batch-redeem': {
                const tickets = Array.isArray(data?.tickets)
                    ? data.tickets.map((ticket) => ({
                        pawnId: Number((ticket as AnyRecord).pawnId),
                        totalAmount: Number((ticket as AnyRecord).totalAmount),
                        discountAmount: Number((ticket as AnyRecord).discountAmount ?? 0),
                    }))
                    : [];
                return httpJson('/pawns/batch/redeem', {
                    method: 'POST',
                    body: JSON.stringify(withCurrentEmployeeId({ tickets })),
                });
            }

            case 'get-pawn-transactions': {
                const pawnId = Number(data?.pawnId);
                if (!Number.isFinite(pawnId)) return { success: false, message: 'Invalid pawn id' };
                return httpJson(`/pawns/${pawnId}/transactions`);
            }

            case 'get-users':
                return httpJson('/users');

            case 'create-user':
                return httpJson('/users', {
                    method: 'POST',
                    body: JSON.stringify(data || {}),
                });

            case 'update-user': {
                const id = Number(data?.id);
                if (!Number.isFinite(id)) return { success: false, message: 'Invalid user id' };
                return httpJson(`/users/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        name: data?.name,
                        userName: data?.userName,
                        password: data?.password,
                        level: data?.level,
                    }),
                });
            }

            case 'delete-user': {
                const id = Number(data?.id);
                if (!Number.isFinite(id)) return { success: false, message: 'Invalid user id' };
                return httpJson(`/users/${id}`, { method: 'DELETE' });
            }

            case 'list-customers':
                return httpJson('/customers');

            case 'update-customer': {
                const id = Number(data?.id);
                if (!Number.isFinite(id)) return { success: false, message: 'Invalid customer id' };
                return httpJson(`/customers/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
            }

            case 'get-customer-pawns': {
                const customerId = Number(data?.customerId);
                if (!Number.isFinite(customerId)) return { success: false, message: 'Invalid customer id' };
                const result = await httpJson(`/customers/${customerId}/pawns`);
                if (result?.success && Array.isArray(result.pawns)) {
                    return { ...result, pawns: result.pawns.map(normalizePawn) };
                }
                return result;
            }

            case 'get-daily-transactions': {
                const raw =
                    typeof data?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date.trim())
                        ? data.date.trim()
                        : localCalendarDateYmd();
                const qs = new URLSearchParams({ date: raw });
                return httpJson(`/reports/daily-transactions?${qs.toString()}`);
            }

            case 'get-recent-transactions': {
                const limit = Math.min(Math.max(Number(data?.limit) || 6, 1), 20);
                return httpJson(`/reports/recent-transactions?limit=${limit}`);
            }

            case 'get-inventory':
                {
                    const result = await httpJson('/reports/inventory');
                    if (result?.success && Array.isArray(result.inventory)) {
                        return {
                            ...result,
                            inventory: result.inventory.map((item) => ({
                                ...item,
                                physicalNumber: usesGoldJewelleryStorage(getRecordItemType(item as AnyRecord))
                                    ? null
                                    : (item as AnyRecord).physicalNumber,
                                storageLocation: resolveStorageLocation(item as AnyRecord),
                            })),
                        };
                    }
                    return result;
                }

            case 'get-financial-summary':
                return httpJson('/reports/financial-summary');

            case 'get-overdue-items': {
                const thresholdDays = Math.max(0, Number.isFinite(Number(data?.thresholdDays))
                    ? Math.floor(Number(data?.thresholdDays))
                    : 30);
                const qs = new URLSearchParams({
                    thresholdDays: String(thresholdDays),
                });
                return httpJson(`/reports/overdue-items?${qs.toString()}`);
            }

            case 'get-top-customers':
                return httpJson('/reports/top-customers');

            case 'get-storage-info': {
                const qs = new URLSearchParams();
                if (typeof data?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date.trim())) {
                    qs.set('date', data.date.trim());
                }
                if (typeof data?.itemType === 'string') {
                    qs.set('itemType', data.itemType);
                }
                const result = await httpJson(`/storage/info${qs.size ? `?${qs.toString()}` : ''}`);
                if (result?.success && result.storageInfo) {
                    return {
                        ...result,
                        storageInfo: normalizeStorageInfo(result.storageInfo as AnyRecord),
                    };
                }
                return result;
            }

            case 'get-db-timezone':
                return httpJson('/settings/db-timezone');

            case 'set-db-timezone':
                return httpJson('/settings/db-timezone', {
                    method: 'PUT',
                    body: JSON.stringify({ timezone: data?.timezone }),
                });

            case 'get-app-settings':
                return httpJson('/settings/app');

            case 'set-app-settings':
                return httpJson('/settings/app', {
                    method: 'PUT',
                    body: JSON.stringify({ settings: data?.settings }),
                });

            default:
                return { success: false, message: `Unknown channel: ${channel}` };
        }
    };

    window.electron = {
        api: {
            auth: { login: (payload: AnyRecord) => invoke('login', payload) },
            users: {
                list: () => invoke('get-users', {}),
                create: (payload: AnyRecord) => invoke('create-user', payload),
                update: (payload: AnyRecord) => invoke('update-user', payload),
                remove: (payload: AnyRecord) => invoke('delete-user', payload),
            },
            pawns: {
                create: (payload: AnyRecord) => invoke('create-pawn', payload),
                list: (payload?: AnyRecord) => invoke('list-pawns', payload || {}),
                get: (payload: AnyRecord) => invoke('get-pawn', payload),
                payInterest: (payload: AnyRecord) => invoke('pay-interest', payload),
                batchExpire: (payload: AnyRecord) => invoke('batch-expire', payload),
                batchPayInterest: (payload: AnyRecord) => invoke('batch-pay-interest', payload),
                adjustAmount: (payload: AnyRecord) => invoke('adjust-pawn-amount', payload),
                updateNote: (payload: AnyRecord) => invoke('update-pawn-note', payload),
                redeem: (payload: AnyRecord) => invoke('redeem-pawn', payload),
                batchRedeem: (payload: AnyRecord) => invoke('batch-redeem', payload),
                transactions: (payload: AnyRecord) => invoke('get-pawn-transactions', payload),
            },
            customers: {
                list: () => invoke('list-customers', {}),
                update: (payload: AnyRecord) => invoke('update-customer', payload),
                pawns: (payload: AnyRecord) => invoke('get-customer-pawns', payload),
            },
            reports: {
                dailyTransactions: (payload: AnyRecord) => invoke('get-daily-transactions', payload),
                inventory: () => invoke('get-inventory', {}),
                financialSummary: () => invoke('get-financial-summary', {}),
                overdueItems: (payload?: AnyRecord) => invoke('get-overdue-items', payload || {}),
                topCustomers: () => invoke('get-top-customers', {}),
            },
            storage: {
                info: () => invoke('get-storage-info', {}),
            },
            settings: {
                getAppSettings: () => invoke('get-app-settings', {}),
                setAppSettings: (payload: AnyRecord) => invoke('set-app-settings', payload),
                getDbTimeZone: () => invoke('get-db-timezone', {}),
                setDbTimeZone: (payload: AnyRecord) => invoke('set-db-timezone', payload),
            },
        },
        ipcRenderer: {
            send: () => undefined,
            on: () => () => undefined,
            once: () => undefined,
            invoke,
        },
    } as unknown as Window['electron'];
};
