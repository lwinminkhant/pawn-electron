import { Card, Loading, StatCard, Txt, useTheme } from '@/components/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

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
            next.activePawnCount = pawnsRes.pawns.length;
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
                    <ActionListItem label="Retry" onPress={() => load()} />
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

            <Card title="Quick actions" padded={false}>
                <ActionListItem label="New pawn" onPress={() => router.push('/pawn/new')} first />
                <ActionListItem label="Interest" onPress={() => router.push('/interest')} />
                <ActionListItem label="Redeem" onPress={() => router.push('/redeem')} />
                <ActionListItem label="View pawns" onPress={() => router.push('/(tabs)/pawns')} />
                <ActionListItem label="Customers" onPress={() => router.push('/(tabs)/customers')} />
                <ActionListItem label="Reports" onPress={() => router.push('/(tabs)/reports')} last />
            </Card>
        </ScrollView>
    );
}

const ActionListItem: React.FC<{
    label: string;
    onPress: () => void;
    first?: boolean;
    last?: boolean;
}> = ({ label, onPress, first = false, last = false }) => {
    const theme = useTheme();

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => ({
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: 14,
                borderTopLeftRadius: first ? theme.radius.lg : 0,
                borderTopRightRadius: first ? theme.radius.lg : 0,
                borderBottomLeftRadius: last ? theme.radius.lg : 0,
                borderBottomRightRadius: last ? theme.radius.lg : 0,
                borderBottomWidth: last ? 0 : 0.5,
                borderBottomColor: theme.palette.border,
                backgroundColor: pressed ? theme.palette.surfaceAlt : 'transparent',
            })}
        >
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <Txt variant="body" weight="500">{label}</Txt>
                <Txt variant="body" color="muted" weight="600">›</Txt>
            </View>
        </Pressable>
    );
};
