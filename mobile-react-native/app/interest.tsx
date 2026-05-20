import { SettlementBatchScreen } from '@/components/SettlementBatchScreen';
import { useAuth } from '@/lib/auth';
import React from 'react';

export default function InterestScreen() {
    const { user } = useAuth();
    return <SettlementBatchScreen mode="interest" employeeId={user?.id} />;
}
