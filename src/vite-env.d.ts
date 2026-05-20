/// <reference types="vite/client" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
    BatchExpirePayload,
    BatchPayInterestPayload,
    BatchRedeemPayload,
    CreateUserPayload,
    DailyTransactionsPayload,
    DeleteUserPayload,
    ListPawnsPayload,
    LoginPayload,
    OverdueItemsPayload,
    PawnTransactionsPayload,
    UpdateUserPayload,
} from '../shared/contracts/ipc';

type IpcArg = unknown;

interface ElectronAPI {
    api: {
        auth: { login: (payload: LoginPayload) => Promise<any> };
        setup: {
            getStatus: () => Promise<any>;
            bootstrap: (payload: {
                adminUser: { name: string; password: string; userName: string };
                dbTimeZone: string;
                settings: unknown;
            }) => Promise<any>;
        };
        users: {
            list: () => Promise<any>;
            create: (payload: CreateUserPayload) => Promise<any>;
            update: (payload: UpdateUserPayload) => Promise<any>;
            remove: (payload: DeleteUserPayload) => Promise<any>;
        };
        pawns: {
            create: (payload: unknown) => Promise<any>;
            list: (payload?: ListPawnsPayload) => Promise<any>;
            payInterest: (payload: { pawnId: number; daysToPay: number; amount: number }) => Promise<any>;
            batchExpire: (payload: BatchExpirePayload) => Promise<any>;
            batchPayInterest: (payload: BatchPayInterestPayload) => Promise<any>;
            adjustAmount: (payload: { pawnId: number; amount: number; adjustmentType: 'PLUS_AMOUNT' | 'MINUS_AMOUNT' }) => Promise<any>;
            adjustWithInterest: (payload: { pawnId: number; amount: number; adjustmentType: 'PLUS_AMOUNT' | 'MINUS_AMOUNT' }) => Promise<any>;
            updateNote: (payload: { pawnId: number; note: string }) => Promise<any>;
            redeem: (payload: { pawnId: number; totalAmount: number; discountAmount?: number }) => Promise<any>;
            batchRedeem: (payload: BatchRedeemPayload) => Promise<any>;
            transactions: (payload: PawnTransactionsPayload) => Promise<any>;
        };
        customers: {
            list: () => Promise<any>;
            pawns: (payload: { customerId: number }) => Promise<any>;
        };
        reports: {
            dailyTransactions: (payload: DailyTransactionsPayload) => Promise<any>;
            inventory: () => Promise<any>;
            financialSummary: () => Promise<any>;
            overdueItems: (payload?: OverdueItemsPayload) => Promise<any>;
            topCustomers: () => Promise<any>;
        };
        storage: { info: () => Promise<any> };
        settings: {
            getAppSettings: () => Promise<any>;
            setAppSettings: (payload: { settings: unknown }) => Promise<any>;
            getDbTimeZone: () => Promise<any>;
            setDbTimeZone: (payload: { timezone: string }) => Promise<any>;
        };
    };
    ipcRenderer: {
        send: (channel: string, data: IpcArg) => void;
        on: (channel: string, func: (...args: IpcArg[]) => void) => () => void;
        once: (channel: string, func: (...args: IpcArg[]) => void) => void;
        invoke: (channel: string, data?: IpcArg) => Promise<any>;
    };
}

declare global {
    interface Window {
        desktopSetup?: {
            getStatus: () => Promise<any>;
            saveRuntimeConfig: (payload: { apiPort?: number; databaseUrl: string }) => Promise<any>;
        };
        electron: ElectronAPI;
    }
}

export {};
