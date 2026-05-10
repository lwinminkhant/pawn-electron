import {
    Banner,
    Card,
    Chip,
    Divider,
    EmptyState,
    KVRow,
    Loading,
    StatCard,
    Txt,
    useTheme,
} from '@/components/primitives';
import {
    api,
    type DailyTransaction,
    type OverdueItem,
    type TopCustomer,
} from '@/lib/api';
import { formatDate, formatMMK } from '@/lib/format';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

type Tab = 'summary' | 'daily' | 'overdue' | 'top';

type Summary = { activeLoans: number; redeemedPrincipal: number; totalInterest: number };

export default function ReportsScreen() {
    const theme = useTheme();
    const [tab, setTab] = useState<Tab>('summary');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const [summary, setSummary] = useState<Summary | null>(null);
    const [daily, setDaily] = useState<DailyTransaction[]>([]);
    const [dailyStats, setDailyStats] = useState({ pawnOut: 0, redeemIn: 0, interest: 0 });
    const [overdue, setOverdue] = useState<OverdueItem[]>([]);
    const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);

    const load = useCallback(async () => {
        setError('');
        const [finRes, dailyRes, overdueRes, topRes] = await Promise.all([
            api.reports.financialSummary(),
            api.reports.dailyTransactions(new Date().toISOString()),
            api.reports.overdueItems(),
            api.reports.topCustomers(),
        ]);

        if (finRes.success && finRes.summary) setSummary(finRes.summary);
        else if (!finRes.success) setError(finRes.message || 'Could not load summary');

        if (dailyRes.success) {
            setDaily(Array.isArray(dailyRes.transactions) ? dailyRes.transactions : []);
            if (dailyRes.stats) setDailyStats(dailyRes.stats);
        }
        if (overdueRes.success && Array.isArray(overdueRes.overdueItems)) {
            setOverdue(overdueRes.overdueItems);
        }
        if (topRes.success && Array.isArray(topRes.topCustomers)) {
            setTopCustomers(topRes.topCustomers);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            load().finally(() => setLoading(false));
        }, [load]),
    );

    if (loading) return <Loading label="Loading reports…" />;

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
                    onRefresh={async () => {
                        setRefreshing(true);
                        await load();
                        setRefreshing(false);
                    }}
                    tintColor={theme.palette.accent}
                />
            }
        >
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                <Chip label="Summary" active={tab === 'summary'} onPress={() => setTab('summary')} />
                <Chip label="Today" active={tab === 'daily'} onPress={() => setTab('daily')} />
                <Chip label="Overdue" active={tab === 'overdue'} onPress={() => setTab('overdue')} />
                <Chip label="Customers" active={tab === 'top'} onPress={() => setTab('top')} />
            </View>

            {error ? <Banner tone="error">{error}</Banner> : null}

            {tab === 'summary' ? (
                <View style={{ gap: theme.spacing.sm }}>
                    <StatCard label="Active loans" value={summary?.activeLoans ?? 0} money tone="accent" />
                    <StatCard
                        label="Redeemed principal"
                        value={summary?.redeemedPrincipal ?? 0}
                        money
                        tone="success"
                    />
                    <StatCard label="Total interest earned" value={summary?.totalInterest ?? 0} money />
                </View>
            ) : null}

            {tab === 'daily' ? (
                <View style={{ gap: theme.spacing.sm }}>
                    <Txt variant="small" color="muted">{formatDate(new Date())}</Txt>
                    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                        <StatCard label="Pawn out" value={dailyStats.pawnOut} money tone="accent" />
                        <StatCard label="Redeem in" value={dailyStats.redeemIn} money tone="success" />
                    </View>
                    <StatCard label="Interest" value={dailyStats.interest} money />
                    {daily.length === 0 ? (
                        <EmptyState title="No transactions today" />
                    ) : (
                        <Card title="Transactions">
                            {daily.map((tx, i) => (
                                <View key={i} style={{ gap: 2 }}>
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <Txt variant="small" weight="500">
                                            {tx.type} · {tx.customer}
                                        </Txt>
                                        <Txt variant="small" weight="600">
                                            {formatMMK(tx.amount)}
                                        </Txt>
                                    </View>
                                    <Txt variant="small" color="subtle">
                                        {tx.items} · {tx.time}
                                    </Txt>
                                    {i < daily.length - 1 ? <Divider /> : null}
                                </View>
                            ))}
                        </Card>
                    )}
                </View>
            ) : null}

            {tab === 'overdue' ? (
                overdue.length === 0 ? (
                    <EmptyState title="No overdue items" hint="Items >30 days past last payment." />
                ) : (
                    <Card title={`Overdue · ${overdue.length}`}>
                        {overdue.map((it, i) => (
                            <View key={it.id} style={{ gap: 2 }}>
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <Txt variant="small" weight="600">
                                        #{it.id} · {it.customerName ?? '—'}
                                    </Txt>
                                    <Txt variant="small" weight="600" color="error">
                                        {formatMMK(it.loanAmount ?? 0)}
                                    </Txt>
                                </View>
                                <Txt variant="small" color="subtle" numberOfLines={1}>
                                    {it.itemDescription || '—'}
                                </Txt>
                                <Txt variant="small" color="muted">
                                    Last paid: {formatDate(it.lastPaymentDate)}
                                </Txt>
                                {i < overdue.length - 1 ? <Divider /> : null}
                            </View>
                        ))}
                    </Card>
                )
            ) : null}

            {tab === 'top' ? (
                topCustomers.length === 0 ? (
                    <EmptyState title="No customer history yet" />
                ) : (
                    <Card title="Customers">
                        {topCustomers.map((c, i) => (
                            <KVRow
                                key={c.customerId}
                                last={i === topCustomers.length - 1}
                                label={`${c.name ?? '—'} · ${c.pawnCount} pawn${c.pawnCount === 1 ? '' : 's'}`}
                                value={formatMMK(c.totalLoanAmount ?? 0)}
                            />
                        ))}
                    </Card>
                )
            ) : null}
        </ScrollView>
    );
}
