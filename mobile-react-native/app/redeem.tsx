import { SettlementBatchScreen } from '@/components/SettlementBatchScreen';
import { useAuth } from '@/lib/auth';
import React from 'react';

export default function RedeemScreen() {
    const { user } = useAuth();
    return <SettlementBatchScreen mode="redeem" employeeId={user?.id} />;
}
