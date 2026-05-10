import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const STORAGE_KEY = '@pawn/apiBaseUrl';
const API_PORT = 8787;

const platformDefaultHost = (): string => {
    if (Platform.OS === 'android') {
        // Android emulator: 10.0.2.2 maps to host machine's localhost.
        // Physical device: user should set a LAN IP in Settings.
        return '10.0.2.2';
    }
    return 'localhost';
};

const expoHostHint = (): string | null => {
    // When running via Expo Go / dev client, the bundler knows the host machine IP.
    // Using it makes API calls work on physical devices on the same Wi-Fi with no config.
    const candidates = [
        (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost,
        Constants.expoConfig?.hostUri,
        (Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost,
    ].filter(Boolean) as string[];
    for (const raw of candidates) {
        const host = raw.split(':')[0];
        if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
    }
    return null;
};

const computeDefaultBaseUrl = (): string => {
    const env = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
    if (env) return env;
    const hint = expoHostHint();
    if (hint) return `http://${hint}:${API_PORT}`;
    return `http://${platformDefaultHost()}:${API_PORT}`;
};

const DEFAULT_BASE_URL = computeDefaultBaseUrl();

let currentBaseUrl = DEFAULT_BASE_URL;
let loaded = false;

export const getApiBaseUrl = async (): Promise<string> => {
    if (!loaded) {
        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored) currentBaseUrl = stored.replace(/\/+$/, '');
        } catch {
            // ignore
        }
        loaded = true;
    }
    return currentBaseUrl;
};

export const setApiBaseUrl = async (url: string): Promise<void> => {
    const trimmed = (url || '').trim().replace(/\/+$/, '');
    currentBaseUrl = trimmed || DEFAULT_BASE_URL;
    loaded = true;
    try {
        if (trimmed) await AsyncStorage.setItem(STORAGE_KEY, currentBaseUrl);
        else await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
};

export const getDefaultApiBaseUrl = () => DEFAULT_BASE_URL;

type AnyRecord = Record<string, unknown>;
export type ApiResponse<T = AnyRecord> = T & { success: boolean; message?: string };

const httpJson = async <T = AnyRecord>(
    path: string,
    init?: RequestInit,
): Promise<ApiResponse<T>> => {
    const base = await getApiBaseUrl();
    let res: Response;
    try {
        res = await fetch(`${base}${path}`, {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'ngrok-skip-browser-warning': 'true',
                ...(init?.headers || {}),
            },
            ...init,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error';
        return { success: false, message: `Cannot reach ${base}: ${message}` } as ApiResponse<T>;
    }
    const raw = await res.text();
    let payload: AnyRecord = {};
    if (raw) {
        try {
            payload = JSON.parse(raw);
        } catch {
            payload = {
                success: false,
                message:
                    raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() ||
                    'Invalid server response',
            };
        }
    }
    if (!res.ok) {
        if (payload && Object.keys(payload).length > 0) {
            return { success: false, ...payload } as ApiResponse<T>;
        }
        return {
            success: false,
            message: `Request failed (${res.status} ${res.statusText})`,
        } as ApiResponse<T>;
    }
    return payload as ApiResponse<T>;
};

export type PawnStatus = 'PAWN' | 'REDEEMED' | 'EXPIRED';

export type PawnRow = {
    id: number;
    customerId: number | null;
    customerName: string | null;
    itemType: string;
    itemDescription: string;
    weight: number | null;
    loanAmount: number | null;
    interestRate: number | null;
    maxAvailableAmount: number | null;
    status: PawnStatus;
    createdAt: string | null;
    lastPaymentDate: string | null;
};

export type Customer = {
    id: number;
    name: string;
    phone?: string;
    address?: string;
    nrc?: string;
    photo?: string;
};

export type AppUser = {
    id: number;
    name: string;
    userName: string;
    level: string;
};

export type CashTransaction = {
    id: number;
    type: string;
    amount: number;
    description: string | null;
    date: string;
    user?: string;
};

export type DailyTransaction = {
    time: string;
    type: string;
    customer: string;
    items: string;
    amount: number;
    user: string;
};

export type InventoryItem = {
    id: number;
    itemType: string | null;
    description: string | null;
    grossWeight: number | null;
    netWeight: number | null;
    loanAmount: number | null;
    storageLocation: string | null;
    boxNumber?: number | null;
    trayNumber?: number | null;
    dayOfMonth?: number | null;
    sequence?: number | null;
    slotNumber: number | null;
    status: string | null;
    createdAt: string | null;
};

export type OverdueItem = {
    id: number;
    customerName: string | null;
    phone: string | null;
    itemDescription: string | null;
    loanAmount: number | null;
    lastPaymentDate: string | null;
};

export type TopCustomer = {
    customerId: number;
    name: string | null;
    phone: string | null;
    pawnCount: number;
    totalLoanAmount: number | null;
};

export type StorageInfo = {
    storageLocation: string;
    boxNumber: number;
    trayNumber: number;
    dayOfMonth: number;
    sequence: number;
    positionNumber: number;
    slotNumber: number;
};

export type CustomerPawn = {
    id: number;
    customerId: number;
    item: { type: string; description: string; weight: number };
    loanAmount: number;
    status: PawnStatus;
    createdAt: string;
};

export const api = {
    client: {
        post: (path: string, body: any) => httpJson(path, { method: 'POST', body: JSON.stringify(body) }),
    },
    auth: {
        login: (payload: { username: string; password: string }) =>
            httpJson<{ user?: { id: number; name: string; level: string } }>('/auth/login', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),
    },
    pawns: {
        list: (status?: PawnStatus) => {
            const q = status ? `?status=${encodeURIComponent(status)}` : '';
            return httpJson<{ pawns?: PawnRow[] }>(`/pawns${q}`);
        },
        create: (payload: AnyRecord) =>
            httpJson<{ pawnId?: number }>('/pawns', {
                method: 'POST',
                body: JSON.stringify(payload),
            }),
        payInterest: (pawnId: number, daysToPay: number, amount: number) =>
            httpJson<{ daysDue?: number; newLastPaymentDate?: string }>(
                `/pawns/${pawnId}/pay-interest`,
                { method: 'POST', body: JSON.stringify({ daysToPay, amount }) },
            ),
        adjust: (
            pawnId: number,
            amount: number,
            adjustmentType: 'PLUS_AMOUNT' | 'MINUS_AMOUNT',
        ) =>
            httpJson(`/pawns/${pawnId}/adjust`, {
                method: 'POST',
                body: JSON.stringify({ amount, adjustmentType }),
            }),
        redeem: (pawnId: number, totalAmount: number, discountAmount = 0) =>
            httpJson(`/pawns/${pawnId}/redeem`, {
                method: 'POST',
                body: JSON.stringify({ totalAmount, discountAmount }),
            }),
        transactions: (pawnId: number) =>
            httpJson<{ transactions?: CashTransaction[] }>(`/pawns/${pawnId}/transactions`),
    },
    customers: {
        list: () => httpJson<{ customers?: Customer[] }>('/customers'),
        pawns: (customerId: number) =>
            httpJson<{ pawns?: CustomerPawn[] }>(`/customers/${customerId}/pawns`),
    },
    users: {
        list: () => httpJson<{ users?: AppUser[] }>('/users'),
        create: (payload: { name: string; userName: string; password: string; level: string }) =>
            httpJson('/users', { method: 'POST', body: JSON.stringify(payload) }),
        update: (
            id: number,
            payload: { name: string; userName: string; password?: string; level: string },
        ) => httpJson(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
        remove: (id: number) => httpJson(`/users/${id}`, { method: 'DELETE' }),
    },
    reports: {
        dailyTransactions: (dateIso: string) => {
            const anchor = new Date(dateIso);
            const y = anchor.getFullYear();
            const mo = anchor.getMonth();
            const d = anchor.getDate();
            const start = new Date(y, mo, d, 0, 0, 0, 0);
            const end = new Date(y, mo, d, 23, 59, 59, 999);
            const date = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const qs = new URLSearchParams({
                date,
                start: start.toISOString(),
                end: end.toISOString(),
            });
            return httpJson<{
                transactions?: DailyTransaction[];
                stats?: { pawnOut: number; redeemIn: number; interest: number };
            }>(`/reports/daily-transactions?${qs.toString()}`);
        },
        inventory: () => httpJson<{ inventory?: InventoryItem[] }>('/reports/inventory'),
        financialSummary: () =>
            httpJson<{
                summary?: {
                    activeLoans: number;
                    redeemedPrincipal: number;
                    totalInterest: number;
                };
            }>('/reports/financial-summary'),
        overdueItems: () => httpJson<{ overdueItems?: OverdueItem[] }>('/reports/overdue-items'),
        topCustomers: () => httpJson<{ topCustomers?: TopCustomer[] }>('/reports/top-customers'),
    },
    storage: {
        info: () => httpJson<{ storageInfo?: StorageInfo }>('/storage/info'),
    },
    health: () => httpJson('/health'),
};
