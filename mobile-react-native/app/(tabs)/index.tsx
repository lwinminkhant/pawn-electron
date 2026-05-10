import { PawnListItem } from '@/components/PawnListItem';
import { Button, Card, EmptyState, Loading, StatCard, Txt, useTheme } from '@/components/primitives';
import { api, type PawnRow } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

type Summary = {
    totalActiveLoan?: number;
    totalRedeemedPrincipal?: number;
    totalInterest?: number;
    activePawnCount?: number;
    customerCount?: number;
};

export default function DashboardScreen() {
    const theme = useTheme();
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [summary, setSummary] = useState<Summary>({});
    const [recentPawns, setRecentPawns] = useState<PawnRow[]>([]);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setError('');
        const [fin, pawnsRes, customersRes] = await Promise.all([
            api.reports.financialSummary(),
            api.pawns.list('PAWN'),
            api.customers.list(),
        ]);

        let next: Summary = {};
        if (fin.success && fin.summary) {
            next = {
                totalActiveLoan: Number(fin.summary.activeLoans ?? 0),
                totalRedeemedPrincipal: Number(fin.summary.redeemedPrincipal ?? 0),
                totalInterest: Number(fin.summary.totalInterest ?? 0),
            };
        } else if (!fin.success) {
            setError(fin.message || 'Could not load summary');
        }

        if (pawnsRes.success && Array.isArray(pawnsRes.pawns)) {
            const sorted = [...pawnsRes.pawns].sort((a, b) => {
                const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bd - ad;
            });
            setRecentPawns(sorted.slice(0, 5));
            next.activePawnCount = sorted.length;
        }

        if (customersRes.success && Array.isArray(customersRes.customers)) {
            next.customerCount = customersRes.customers.length;
        }

        setSummary(next);
    }, []);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            load().finally(() => setLoading(false));
        }, [load]),
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    if (loading) return <Loading label="Loading dashboard…" />;

    return (
        <ScrollView
            style={{ backgroundColor: theme.palette.bg }}
            contentContainerStyle={{
                padding: theme.spacing.lg,
                gap: theme.spacing.md,
                paddingBottom: 32,
            }}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={theme.palette.accent}
                />
            }
        >
            <View style={{ gap: 2 }}>
                <Txt variant="small" color="muted">{formatDate(new Date())}</Txt>
                <Txt variant="title">Hello{user ? `, ${user.name}` : ''}</Txt>
            </View>

            {error ? (
                <Card>
                    <Txt color="error">{error}</Txt>
                    <Button label="Retry" variant="secondary" onPress={() => load()} />
                </Card>
            ) : null}

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <StatCard label="Active loans" value={summary.totalActiveLoan ?? 0} money tone="accent" />
                <StatCard label="Interest earned" value={summary.totalInterest ?? 0} money tone="success" />
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <StatCard label="Active pawns" value={summary.activePawnCount ?? 0} />
                <StatCard label="Customers" value={summary.customerCount ?? 0} />
            </View>

            <Card title="Quick actions">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                    <Button label="New pawn" onPress={() => router.push('/pawn/new')} />
                    <Button label="View pawns" variant="secondary" onPress={() => router.push('/(tabs)/pawns')} />
                    <Button label="Reports" variant="secondary" onPress={() => router.push('/(tabs)/reports')} />
                </View>
            </Card>

            <View style={{ gap: theme.spacing.sm }}>
                <View
                    style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <Txt variant="heading">Recent pawns</Txt>
                    <Button
                        label="See all"
                        variant="ghost"
                        size="sm"
                        onPress={() => router.push('/(tabs)/pawns')}
                    />
                </View>
                {recentPawns.length === 0 ? (
                    <EmptyState title="No active pawns" hint="Create a new pawn to get started." />
                ) : (
                    recentPawns.map((p) => (
                        <PawnListItem
                            key={p.id}
                            pawn={p}
                            onPress={() =>
                                router.push({ pathname: '/pawn/[id]', params: { id: String(p.id) } })
                            }
                        />
                    ))
                )}
            </View>
        </ScrollView>
    );
}
