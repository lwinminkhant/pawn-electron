import {
    Banner,
    Button,
    Card,
    EmptyState,
    Field,
    Input,
    KVRow,
    Loading,
    StatCard,
    Txt,
    useTheme,
} from '@/components/primitives';
import {
    api,
    type BatchInterestRequestItem,
    type BatchRedeemRequestItem,
    type BatchSettlementResult,
    type PawnRow,
    type SettlementPawn,
} from '@/lib/api';
import {
    addCalendarDays,
    calculateInterestAmountForPeriod,
    calculateRedeemInterest,
    formatDate,
    formatMMK,
    sanitizeNumericInput,
} from '@/lib/format';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

type SettlementMode = 'interest' | 'redeem';

type Props = {
    mode: SettlementMode;
    employeeId?: number;
    title?: string;
    subtitle?: string;
    onBack?: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getInterestBaseDate = (pawn: SettlementPawn) => pawn.lastPaymentDate || pawn.createdAt;

const getInterestAmount = (pawn: SettlementPawn, daysToPay: number) => {
    if (daysToPay <= 0) return 0;
    const maxDue = Math.max(0, pawn.daysDue ?? 0);
    if (daysToPay >= maxDue && typeof pawn.currentInterestDue === 'number') {
        return Math.max(0, pawn.currentInterestDue);
    }
    const baseDate = getInterestBaseDate(pawn);
    const nextPaidUntil = addCalendarDays(baseDate, daysToPay);
    return calculateInterestAmountForPeriod(
        pawn.loanAmount,
        pawn.interestRate,
        baseDate,
        nextPaidUntil,
    );
};

const getRedeemInterestDue = (pawn: SettlementPawn) =>
    calculateRedeemInterest(
        pawn.loanAmount,
        pawn.interestRate,
        pawn.lastPaymentDate,
        pawn.createdAt,
        new Date(),
        pawn.hasInterestPayments ?? false,
    );

export const SettlementBatchScreen: React.FC<Props> = ({
    mode,
    employeeId,
    title: titleOverride,
    subtitle,
    onBack,
}) => {
    const theme = useTheme();
    const title = titleOverride ?? (mode === 'interest' ? 'Batch interest' : 'Batch redeem');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [availablePawns, setAvailablePawns] = useState<PawnRow[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [selectedPawns, setSelectedPawns] = useState<SettlementPawn[]>([]);
    const [search, setSearch] = useState('');
    const [ticketIdInput, setTicketIdInput] = useState('');
    const [interestDays, setInterestDays] = useState<Record<number, string>>({});
    const [redeemDiscounts, setRedeemDiscounts] = useState<Record<number, string>>({});
    const [error, setError] = useState('');
    const [result, setResult] = useState<BatchSettlementResult | null>(null);

    const loadAvailable = useCallback(async () => {
        const res = await api.pawns.list('PAWN');
        if (res.success && Array.isArray(res.pawns)) {
            setAvailablePawns(res.pawns);
            return;
        }
        throw new Error(res.message || 'Could not load active tickets');
    }, []);

    const loadSelected = useCallback(async (ids: number[]) => {
        if (ids.length === 0) {
            setSelectedPawns([]);
            return;
        }

        const responses = await Promise.all(ids.map((id) => api.pawns.get(id)));
        const nextPawns: SettlementPawn[] = [];
        const nextIds: number[] = [];
        const failures: string[] = [];

        responses.forEach((res, index) => {
            const pawnId = ids[index];
            if (res.success && res.pawn) {
                nextPawns.push(res.pawn);
                nextIds.push(pawnId);
                return;
            }
            failures.push(res.message || `Ticket #${pawnId} could not be loaded`);
        });

        setSelectedPawns(nextPawns);
        if (nextIds.length !== ids.length) {
            setSelectedIds(nextIds);
        }
        if (failures.length > 0) {
            setError(failures.join(' '));
        }
    }, []);

    const load = useCallback(async () => {
        setError('');
        await Promise.all([loadAvailable(), loadSelected(selectedIds)]);
    }, [loadAvailable, loadSelected, selectedIds]);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            load().catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Could not load settlement screen');
            }).finally(() => setLoading(false));
        }, [load]),
    );

    const addTicket = useCallback(async (pawnId: number) => {
        if (selectedIds.includes(pawnId)) return;
        setError('');
        const res = await api.pawns.get(pawnId);
        if (!res.success || !res.pawn) {
            setError(res.message || `Ticket #${pawnId} is not available`);
            return;
        }

        setResult(null);
        setSelectedIds((current) => [...current, pawnId]);
        setSelectedPawns((current) => [...current, res.pawn!]);
        if (mode === 'interest') {
            setInterestDays((current) => ({
                ...current,
                [pawnId]: String(Math.max(0, res.pawn?.daysDue ?? 0)),
            }));
        } else {
            setRedeemDiscounts((current) => ({
                ...current,
                [pawnId]: current[pawnId] ?? '0',
            }));
        }
        setTicketIdInput('');
    }, [mode, selectedIds]);

    const removeTicket = (pawnId: number) => {
        setSelectedIds((current) => current.filter((id) => id !== pawnId));
        setSelectedPawns((current) => current.filter((pawn) => pawn.id !== pawnId));
        setInterestDays((current) => {
            const next = { ...current };
            delete next[pawnId];
            return next;
        });
        setRedeemDiscounts((current) => {
            const next = { ...current };
            delete next[pawnId];
            return next;
        });
    };

    const filteredAvailable = useMemo(() => {
        const selected = new Set(selectedIds);
        const q = search.trim().toLowerCase();
        return availablePawns
            .filter((pawn) => !selected.has(pawn.id))
            .filter((pawn) => {
                if (!q) return true;
                const haystack = `${pawn.id} ${pawn.customerName ?? ''} ${pawn.itemType} ${pawn.itemDescription}`.toLowerCase();
                return haystack.includes(q);
            })
            .slice(0, 24);
    }, [availablePawns, search, selectedIds]);

    const interestRows = useMemo(() => selectedPawns.map((pawn) => {
        const daysDue = Math.max(0, pawn.daysDue ?? 0);
        const enteredDays = Number(interestDays[pawn.id] ?? daysDue);
        const daysToPay = Number.isFinite(enteredDays) ? clamp(Math.floor(enteredDays), 0, daysDue) : 0;
        const amount = getInterestAmount(pawn, daysToPay);
        const paidUntil = addCalendarDays(getInterestBaseDate(pawn), daysToPay);
        return { pawn, daysDue, daysToPay, amount, paidUntil };
    }), [interestDays, selectedPawns]);

    const redeemRows = useMemo(() => selectedPawns.map((pawn) => {
        const interestDue = getRedeemInterestDue(pawn);
        const enteredDiscount = Number(redeemDiscounts[pawn.id] ?? 0);
        const discount = clamp(
            Number.isFinite(enteredDiscount) ? Math.floor(Math.max(0, enteredDiscount)) : 0,
            0,
            interestDue,
        );
        return {
            pawn,
            interestDue,
            discount,
            total: Math.max(0, pawn.loanAmount + interestDue - discount),
        };
    }), [redeemDiscounts, selectedPawns]);

    const totals = useMemo(() => {
        if (mode === 'interest') {
            return interestRows.reduce((sum, row) => ({
                count: sum.count + (row.amount > 0 ? 1 : 0),
                principal: sum.principal,
                interest: sum.interest + row.amount,
                discount: 0,
                total: sum.total + row.amount,
            }), { count: 0, principal: 0, interest: 0, discount: 0, total: 0 });
        }

        return redeemRows.reduce((sum, row) => ({
            count: sum.count + 1,
            principal: sum.principal + row.pawn.loanAmount,
            interest: sum.interest + row.interestDue,
            discount: sum.discount + row.discount,
            total: sum.total + row.total,
        }), { count: 0, principal: 0, interest: 0, discount: 0, total: 0 });
    }, [interestRows, mode, redeemRows]);

    const submit = async () => {
        setError('');
        setSubmitting(true);
        try {
            if (mode === 'interest') {
                const tickets: BatchInterestRequestItem[] = interestRows
                    .filter((row) => row.daysToPay > 0 && row.amount > 0)
                    .map((row) => ({
                        pawnId: row.pawn.id,
                        daysToPay: row.daysToPay,
                        amount: row.amount,
                    }));
                if (tickets.length === 0) {
                    throw new Error('Add at least one payable ticket');
                }

                const res = await api.pawns.batchPayInterest(tickets, employeeId);
                if (!res.success) throw new Error(res.message || 'Batch interest payment failed');
                setResult(res);
            } else {
                const tickets: BatchRedeemRequestItem[] = redeemRows.map((row) => ({
                    pawnId: row.pawn.id,
                    totalAmount: row.total,
                    discountAmount: row.discount,
                }));
                if (tickets.length === 0) {
                    throw new Error('Add at least one ticket to redeem');
                }

                const res = await api.pawns.batchRedeem(tickets, employeeId);
                if (!res.success) throw new Error(res.message || 'Batch redeem failed');
                setResult(res);
            }

            setSelectedIds([]);
            setSelectedPawns([]);
            setInterestDays({});
            setRedeemDiscounts({});
            await loadAvailable();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Settlement failed');
        } finally {
            setSubmitting(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await load();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Could not refresh');
        } finally {
            setRefreshing(false);
        }
    };

    if (loading) return <Loading label={`Loading ${title.toLowerCase()}…`} />;

    return (
        <ScrollView
            style={{ backgroundColor: theme.palette.bg }}
            contentContainerStyle={{
                padding: theme.spacing.lg,
                gap: theme.spacing.md,
                paddingBottom: 40,
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
                <Txt variant="title">{title}</Txt>
                <Txt variant="small" color="muted">
                    {subtitle ?? 'Search active tickets, build a cart, then submit one batch action.'}
                </Txt>
            </View>

            {onBack ? (
                <Button label="Back to pawns" variant="ghost" onPress={onBack} />
            ) : null}

            {error ? <Banner tone="error">{error}</Banner> : null}

            {result ? (
                <Card title="Last batch completed">
                    <Banner tone="success">
                        {result.results.length} ticket{result.results.length === 1 ? '' : 's'} processed.
                    </Banner>
                    <KVRow label="Total collected" value={formatMMK(result.totals.total)} />
                    <KVRow label="Interest" value={formatMMK(result.totals.interest)} />
                    {mode === 'redeem' ? (
                        <>
                            <KVRow label="Principal" value={formatMMK(result.totals.principal)} />
                            <KVRow label="Discount" value={formatMMK(result.totals.discount)} last />
                        </>
                    ) : (
                        <KVRow label="Tickets" value={String(result.results.length)} last />
                    )}
                </Card>
            ) : null}

            <Card title="Add tickets">
                <Field label="Ticket number">
                    <Input
                        value={ticketIdInput}
                        onChangeText={(value) => setTicketIdInput(sanitizeNumericInput(value))}
                        placeholder="Enter ticket id"
                        keyboardType="numeric"
                    />
                </Field>
                <Button
                    label="Add ticket"
                    onPress={() => {
                        const pawnId = Number(ticketIdInput);
                        if (!Number.isFinite(pawnId) || pawnId <= 0) {
                            setError('Enter a valid ticket id');
                            return;
                        }
                        void addTicket(pawnId);
                    }}
                />
                <Field label="Search active tickets">
                    <Input
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search id, customer, item…"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </Field>
                {filteredAvailable.length === 0 ? (
                    <EmptyState
                        title="No matching active tickets"
                        hint="Try a different search or add by ticket number."
                    />
                ) : (
                    <View style={{ gap: theme.spacing.sm }}>
                        {filteredAvailable.map((pawn) => (
                            <Pressable
                                key={pawn.id}
                                onPress={() => void addTicket(pawn.id)}
                                style={({ pressed }) => [
                                    styles.row,
                                    {
                                        backgroundColor: theme.palette.surfaceAlt,
                                        borderColor: theme.palette.border,
                                        opacity: pressed ? 0.85 : 1,
                                    },
                                ]}
                            >
                                <View style={{ flex: 1, gap: 2 }}>
                                    <Txt variant="subheading">#{pawn.id} · {pawn.customerName ?? '—'}</Txt>
                                    <Txt variant="small" color="muted" numberOfLines={1}>
                                        {pawn.itemType} · {pawn.itemDescription}
                                    </Txt>
                                </View>
                                <Txt variant="small" weight="600" color="accent">
                                    Add
                                </Txt>
                            </Pressable>
                        ))}
                    </View>
                )}
            </Card>

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <StatCard label="Selected" value={selectedPawns.length} />
                <StatCard
                    label={mode === 'interest' ? 'Collecting' : 'Customer pays'}
                    value={totals.total}
                    money
                    tone={mode === 'interest' ? 'accent' : 'success'}
                />
            </View>

            <Card title={`Selected tickets · ${selectedPawns.length}`}>
                {selectedPawns.length === 0 ? (
                    <EmptyState
                        title="No tickets selected"
                        hint={`Add active tickets above to start a ${mode} batch.`}
                    />
                ) : (
                    <View style={{ gap: theme.spacing.md }}>
                        {mode === 'interest' ? interestRows.map((row) => (
                            <View key={row.pawn.id} style={styles.ticketCard}>
                                <View style={styles.ticketHeader}>
                                    <View style={{ flex: 1, gap: 2 }}>
                                        <Txt variant="subheading">#{row.pawn.id} · {row.pawn.customerName}</Txt>
                                        <Txt variant="small" color="muted" numberOfLines={1}>
                                            {row.pawn.item.type} · {row.pawn.item.description}
                                        </Txt>
                                    </View>
                                    <Button
                                        label="Remove"
                                        variant="ghost"
                                        size="sm"
                                        onPress={() => removeTicket(row.pawn.id)}
                                    />
                                </View>
                                <KVRow label="Days due" value={String(row.daysDue)} />
                                <KVRow label="Last paid" value={formatDate(row.pawn.lastPaymentDate || row.pawn.createdAt)} />
                                <Field label="Days to pay">
                                    <Input
                                        value={interestDays[row.pawn.id] ?? String(row.daysDue)}
                                        onChangeText={(value) => {
                                            setInterestDays((current) => ({
                                                ...current,
                                                [row.pawn.id]: sanitizeNumericInput(value),
                                            }));
                                        }}
                                        keyboardType="numeric"
                                    />
                                </Field>
                                <KVRow label="Paid until" value={formatDate(row.paidUntil)} />
                                <KVRow
                                    label="Amount"
                                    value={
                                        <Txt weight="600" color={row.amount > 0 ? 'accent' : 'muted'}>
                                            {formatMMK(row.amount)}
                                        </Txt>
                                    }
                                    last
                                />
                            </View>
                        )) : redeemRows.map((row) => (
                            <View key={row.pawn.id} style={styles.ticketCard}>
                                <View style={styles.ticketHeader}>
                                    <View style={{ flex: 1, gap: 2 }}>
                                        <Txt variant="subheading">#{row.pawn.id} · {row.pawn.customerName}</Txt>
                                        <Txt variant="small" color="muted" numberOfLines={1}>
                                            {row.pawn.item.type} · {row.pawn.item.description}
                                        </Txt>
                                    </View>
                                    <Button
                                        label="Remove"
                                        variant="ghost"
                                        size="sm"
                                        onPress={() => removeTicket(row.pawn.id)}
                                    />
                                </View>
                                <KVRow label="Principal" value={formatMMK(row.pawn.loanAmount)} />
                                <KVRow label="Interest due" value={formatMMK(row.interestDue)} />
                                <Field label="Discount on interest">
                                    <Input
                                        value={redeemDiscounts[row.pawn.id] ?? '0'}
                                        onChangeText={(value) => {
                                            setRedeemDiscounts((current) => ({
                                                ...current,
                                                [row.pawn.id]: sanitizeNumericInput(value),
                                            }));
                                        }}
                                        keyboardType="numeric"
                                    />
                                </Field>
                                <KVRow
                                    label="Customer pays"
                                    value={
                                        <Txt weight="600" color="success">
                                            {formatMMK(row.total)}
                                        </Txt>
                                    }
                                    last
                                />
                            </View>
                        ))}
                    </View>
                )}
            </Card>

            {selectedPawns.length > 0 ? (
                <Card title="Batch totals">
                    {mode === 'redeem' ? (
                        <>
                            <KVRow label="Principal" value={formatMMK(totals.principal)} />
                            <KVRow label="Interest" value={formatMMK(totals.interest)} />
                            <KVRow label="Discount" value={formatMMK(totals.discount)} />
                        </>
                    ) : null}
                    <KVRow
                        label={mode === 'interest' ? 'Total interest' : 'Customer pays'}
                        value={
                            <Txt weight="600" color={mode === 'interest' ? 'accent' : 'success'}>
                                {formatMMK(totals.total)}
                            </Txt>
                        }
                        last
                    />
                    <Button
                        label={
                            submitting
                                ? 'Submitting…'
                                : mode === 'interest'
                                ? 'Pay batch interest'
                                : 'Redeem batch'
                        }
                        variant={mode === 'interest' ? 'primary' : 'success'}
                        fullWidth
                        loading={submitting}
                        onPress={() => void submit()}
                    />
                </Card>
            ) : null}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 16,
        padding: 14,
    },
    ticketCard: {
        gap: 10,
    },
    ticketHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
});
