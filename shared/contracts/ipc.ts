export type ApiResult<T = unknown> = {
    success: boolean;
    data?: T;
    message?: string;
    code?: string;
};

export type LoginPayload = { username: string; password: string };
export type LoginData = { user: { id: number; name: string; level: string } };

export type UserRecord = { id: number; name: string; userName: string; level: string };
export type CreateUserPayload = { name: string; userName: string; password: string; level: string };
export type UpdateUserPayload = { id: number; name: string; userName: string; password?: string; level: string };
export type DeleteUserPayload = { id: number };

export type PawnStatus = 'PAWN' | 'REDEEMED' | 'EXPIRED';
export type ListPawnsPayload = { status?: PawnStatus };
export type PawnTransactionsPayload = { pawnId: number };
export type CustomerPawnsPayload = { customerId: number };
export type DailyTransactionsPayload = { date: string };
export type OverdueItemsPayload = { thresholdDays?: number };
export type BatchExpirePayload = {
    pawnIds: number[];
};
export type BatchPayInterestPayload = {
    tickets: { pawnId: number; daysToPay: number; amount: number }[];
};
export type BatchRedeemPayload = {
    tickets: { pawnId: number; totalAmount: number; discountAmount?: number }[];
};
