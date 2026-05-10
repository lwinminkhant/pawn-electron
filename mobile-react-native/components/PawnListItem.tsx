import { Card, Chip, Txt, useTheme } from '@/components/primitives';
import type { PawnRow } from '@/lib/api';
import { formatDate, formatMMK } from '@/lib/format';
import React from 'react';
import { View } from 'react-native';

type Props = {
    pawn: PawnRow;
    onPress?: () => void;
    showCustomer?: boolean;
};

const STATUS_TONE: Record<string, 'success' | 'error' | 'warning' | 'accent'> = {
    PAWN: 'accent',
    REDEEMED: 'success',
    EXPIRED: 'error',
};

export const PawnListItem: React.FC<Props> = ({ pawn, onPress, showCustomer = true }) => {
    const theme = useTheme();
    const tone = STATUS_TONE[pawn.status] || 'accent';
    return (
        <Card onPress={onPress} style={{ gap: theme.spacing.sm }}>
            <View
                style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                }}
            >
                <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="subheading" numberOfLines={1}>
                        {pawn.itemType} · #{pawn.id}
                    </Txt>
                    {showCustomer && pawn.customerName ? (
                        <Txt variant="small" color="muted" numberOfLines={1}>
                            {pawn.customerName}
                        </Txt>
                    ) : null}
                </View>
                <Chip label={pawn.status} tone={tone} />
            </View>
            <Txt variant="small" color="muted" numberOfLines={2}>
                {pawn.itemDescription || 'No description'}
            </Txt>
            <View
                style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    gap: theme.spacing.sm,
                }}
            >
                <View style={{ gap: 2 }}>
                    <Txt variant="micro" color="subtle">LOAN</Txt>
                    <Txt variant="heading" color="accent">{formatMMK(pawn.loanAmount)}</Txt>
                </View>
                <View style={{ gap: 2, alignItems: 'flex-end' }}>
                    <Txt variant="micro" color="subtle">LAST PAID</Txt>
                    <Txt variant="small">{formatDate(pawn.lastPaymentDate || pawn.createdAt)}</Txt>
                </View>
            </View>
        </Card>
    );
};
