import { Card, EmptyState, Input, Loading, Txt, useTheme } from '@/components/primitives';
import { api, type Customer } from '@/lib/api';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

export default function CustomersScreen() {
    const theme = useTheme();
    const router = useRouter();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setError('');
        const res = await api.customers.list();
        if (res.success && Array.isArray(res.customers)) setCustomers(res.customers);
        else {
            setCustomers([]);
            setError(res.message || 'Could not load customers');
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            load().finally(() => setLoading(false));
        }, [load]),
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return customers;
        return customers.filter((c) =>
            `${c.name} ${c.phone ?? ''} ${c.address ?? ''}`.toLowerCase().includes(q),
        );
    }, [customers, search]);

    return (
        <View style={{ flex: 1, backgroundColor: theme.palette.bg }}>
            <View style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
                <Input
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search name, phone…"
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
                                await load();
                                setRefreshing(false);
                            }}
                            tintColor={theme.palette.accent}
                        />
                    }
                    ListEmptyComponent={
                        <EmptyState
                            title={error ? 'Error' : 'No customers yet'}
                            hint={error || 'Customers are created when you create a new pawn.'}
                        />
                    }
                    renderItem={({ item }) => (
                        <Card
                            onPress={() =>
                                router.push({
                                    pathname: '/customer/[id]',
                                    params: { id: String(item.id) },
                                })
                            }
                        >
                            <Txt variant="subheading">{item.name}</Txt>
                            {item.phone ? <Txt variant="small" color="muted">{item.phone}</Txt> : null}
                            {item.address ? (
                                <Txt variant="small" color="subtle" numberOfLines={1}>
                                    {item.address}
                                </Txt>
                            ) : null}
                        </Card>
                    )}
                />
            )}
        </View>
    );
}
