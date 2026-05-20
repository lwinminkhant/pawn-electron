import { PawnListItem } from '@/components/PawnListItem';
import { Chip, EmptyState, Input, Loading, useTheme } from '@/components/primitives';
import { api, type PawnRow, type PawnStatus } from '@/lib/api';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

const STATUS_OPTIONS: { label: string; value: PawnStatus }[] = [
    { label: 'Active', value: 'PAWN' },
    { label: 'Redeemed', value: 'REDEEMED' },
    { label: 'Expired', value: 'EXPIRED' },
];

export default function PawnsScreen() {
    const theme = useTheme();
    const [status, setStatus] = useState<PawnStatus>('PAWN');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pawns, setPawns] = useState<PawnRow[]>([]);
    const [error, setError] = useState('');

    const load = useCallback(async (nextStatus: PawnStatus) => {
        setError('');
        const res = await api.pawns.list(nextStatus);
        if (res.success && Array.isArray(res.pawns)) setPawns(res.pawns);
        else {
            setPawns([]);
            setError(res.message || 'Could not load pawns');
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            load(status).finally(() => setLoading(false));
        }, [status, load]),
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return pawns;
        return pawns.filter((p) => {
            const hay = `${p.id} ${p.customerName ?? ''} ${p.itemType} ${p.itemDescription}`.toLowerCase();
            return hay.includes(q);
        });
    }, [pawns, search]);

    return (
        <View style={{ flex: 1, backgroundColor: theme.palette.bg }}>
            <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                    {STATUS_OPTIONS.map((opt) => (
                        <Chip
                            key={opt.value}
                            label={opt.label}
                            active={status === opt.value}
                            onPress={() => setStatus(opt.value)}
                        />
                    ))}
                </View>
                <Input
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search id, customer, item…"
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

            {loading ? (
                <Loading />
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={{
                        paddingHorizontal: theme.spacing.lg,
                        paddingBottom: 32,
                        gap: theme.spacing.sm,
                    }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={async () => {
                                setRefreshing(true);
                                await load(status);
                                setRefreshing(false);
                            }}
                            tintColor={theme.palette.accent}
                        />
                    }
                    ListEmptyComponent={
                        <EmptyState
                            title={error ? 'Error' : 'No pawns here'}
                            hint={error || 'Pull to refresh.'}
                        />
                    }
                    renderItem={({ item }) => (
                        <PawnListItem
                            pawn={item}
                            onPress={() =>
                                router.push({ pathname: '/pawn/[id]', params: { id: String(item.id) } })
                            }
                        />
                    )}
                />
            )}
        </View>
    );
}
