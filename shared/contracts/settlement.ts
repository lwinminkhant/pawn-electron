export type SettlementMode = 'redeem' | 'interest';

export type BatchInterestRequestItem = {
    pawnId: number;
    daysToPay: number;
    amount: number;
};

export type BatchRedeemRequestItem = {
    pawnId: number;
    totalAmount: number;
    discountAmount?: number;
};

export type BatchInterestPayload = {
    tickets: BatchInterestRequestItem[];
};

export type BatchRedeemPayload = {
    tickets: BatchRedeemRequestItem[];
};

export type BatchSettlementTicketResult = {
    pawnId: number;
    customerName: string;
    principal: number;
    interest: number;
    discount: number;
    total: number;
    daysToPay?: number;
    newLastPaymentDate?: string;
    redeemedAt?: string;
};

export type BatchSettlementTotals = {
    principal: number;
    interest: number;
    discount: number;
    total: number;
};

export type BatchSettlementResult = {
    success: boolean;
    mode: SettlementMode;
    results: BatchSettlementTicketResult[];
    totals: BatchSettlementTotals;
    message?: string;
};
