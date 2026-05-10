import {
    Card,
    Chip,
    EmptyState,
    KVRow,
    Loading,
    Txt,
    useTheme,
} from '@/components/primitives';
import { api, type Customer, type CustomerPawn, type PawnStatus } from '@/lib/api';
import { formatDateTime, formatMMK } from '@/lib/format';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

const statusTone = (status: PawnStatus): 'success' | 'error' | 'accent' => {
    if (status === 'REDEEMED') return 'success';
    if (status === 'EXPIRED') return 'error';
    return 'accent';
};

export default function CustomerDetailScreen() {
    const theme = useTheme();
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const customerId = Number(id);

    const [customer, setCustomer] = useState<Customer | null>(null);
    const [pawns, setPawns] = useState<CustomerPawn[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setError('');
        const [listRes, pawnsRes] = await Promise.all([
            api.customers.list(),
            api.customers.pawns(customerId),
        ]);
        if (listRes.success && Array.isArray(listRes.customers)) {
            setCustomer(listRes.customers.find((c) => c.id === customerId) ?? null);
        }
        if (pawnsRes.success && Array.isArray(pawnsRes.pawns)) {
            setPawns(pawnsRes.pawns);
        } else if (!pawnsRes.success) {
            setError(pawnsRes.message || 'Could not load pawns');
        }
    }, [customerId]);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            load().finally(() => setLoading(false));
        }, [load]),
    );

    if (loading) return <Loading label="Loading customer…" />;

    const totalLoan = pawns.reduce((sum, p) => sum + (p.loanAmount || 0), 0);
    const activeCount = pawns.filter((p) => p.status === 'PAWN').length;

    return (
        <ScrollView
            style={{ backgroundColor: theme.palette.bg }}
            contentContainerStyle={{
                padding: theme.spacing.lg,
                gap: theme.spacing.md,
                paddingBottom: 48,
            }}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={async () => {
                        setRefreshing(true);
                        await load();
                        setRefreshing(false);
                    }}
                    tintColor={theme.palette.accent}
                />
            }
        >
            <Txt variant="title">{customer?.name ?? 'Customer'}</Txt>

            <Card title="Contact">
                <KVRow label="Phone" value={customer?.phone || '—'} />
                <KVRow label="Address" value={customer?.address || '—'} />
                <KVRow label="NRC" value={customer?.nrc || '—'} last />
            </Card>

            <Card title="Overview">
                <KVRow label="Pawns" value={String(pawns.length)} />
                <KVRow label="Active" value={String(activeCount)} />
                <KVRow label="Total principal" value={formatMMK(totalLoan)} last />
            </Card>

            <View style={{ gap: theme.spacing.sm }}>
                <Txt variant="heading">Pawns</Txt>
                {pawns.length === 0 ? (
                    <EmptyState title="No pawns" hint={error || 'This customer has no pawns yet.'} />
                ) : (
                    pawns.map((p) => (
                        <Pressable
                            key={p.id}
                            onPress={() =>
                                router.push({ pathname: '/pawn/[id]', params: { id: String(p.id) } })
                            }
                            style={({ pressed }) => [
                                styles.row,
                                {
                                    backgroundColor: theme.palette.surface,
                                    borderRadius: theme.radius.lg,
                                    borderColor: theme.palette.border,
                                    opacity: pressed ? 0.85 : 1,
                                },
                            ]}
                        >
                            <View style={{ flex: 1, gap: 2 }}>
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: theme.spacing.sm,
                                    }}
                                >
                                    <Txt variant="subheading">{p.item.type}</Txt>
                                    <Chip label={p.status} tone={statusTone(p.status)} />
                                </View>
                                <Txt variant="small" color="muted" numberOfLines={1}>
                                    {p.item.description}
                                </Txt>
                                <Txt variant="small" color="subtle">
                                    {formatDateTime(p.createdAt)}
                                </Txt>
                            </View>
                            <Txt variant="body" weight="600">{formatMMK(p.loanAmount)}</Txt>
                        </Pressable>
                    ))
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderWidth: StyleSheet.hairlineWidth,
        gap: 12,
    },
});
