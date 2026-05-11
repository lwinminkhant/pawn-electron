import {
    Banner,
    Button,
    Card,
    Chip,
    Divider,
    EmptyState,
    Field,
    Input,
    KVRow,
    Loading,
    Txt,
    useTheme,
} from '@/components/primitives';
import { api, type CashTransaction, type PawnRow } from '@/lib/api';
import {
    calculateInterestByDays,
    calculateRedeemInterest,
    daysBetween,
    formatDate,
    formatDateTime,
    formatMMK,
    sanitizeNumericInput,
} from '@/lib/format';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

type SheetMode = null | 'pay' | 'adjust' | 'redeem';

const statusTone = (status?: string): 'success' | 'error' | 'warning' | 'accent' | 'default' => {
    if (status === 'REDEEMED') return 'success';
    if (status === 'EXPIRED') return 'error';
    if (status === 'PAWN') return 'accent';
    return 'default';
};

export default function PawnDetailScreen() {
    const theme = useTheme();
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const pawnId = Number(id);

    const [pawn, setPawn] = useState<PawnRow | null>(null);
    const [transactions, setTransactions] = useState<CashTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [sheet, setSheet] = useState<SheetMode>(null);

    const load = useCallback(async () => {
        setError('');
        const [listRes, txRes] = await Promise.all([
            api.pawns.list(),
            api.pawns.transactions(pawnId),
        ]);
        if (listRes.success && Array.isArray(listRes.pawns)) {
            const found = listRes.pawns.find((p) => p.id === pawnId) || null;
            setPawn(found);
            if (!found) setError('Pawn not found');
        } else if (!listRes.success) {
            setError(listRes.message || 'Could not load pawn');
        }
        if (txRes.success && Array.isArray(txRes.transactions)) {
            setTransactions(txRes.transactions as CashTransaction[]);
        }
    }, [pawnId]);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            load().finally(() => setLoading(false));
        }, [load]),
    );

    const { daysDue, interestDue, redeemInterestDue, dailyInterest } = useMemo(() => {
        if (!pawn) return { daysDue: 0, interestDue: 0, redeemInterestDue: 0, dailyInterest: 0 };
        const base = pawn.lastPaymentDate || pawn.createdAt || new Date().toISOString();
        const days = daysBetween(base, new Date());
        const daily = calculateInterestByDays(pawn.loanAmount ?? 0, pawn.interestRate ?? 0, 1);
        const due = calculateInterestByDays(pawn.loanAmount ?? 0, pawn.interestRate ?? 0, days);
        const redeemDue = calculateRedeemInterest(
            pawn.loanAmount ?? 0,
            pawn.interestRate ?? 0,
            pawn.lastPaymentDate,
            pawn.createdAt,
            new Date(),
            pawn.hasInterestPayments ?? false,
        );
        return { daysDue: days, interestDue: due, redeemInterestDue: redeemDue, dailyInterest: daily };
    }, [pawn]);

    if (loading) return <Loading label="Loading pawn…" />;
    if (!pawn) {
        return (
            <View style={{ flex: 1, padding: theme.spacing.lg, backgroundColor: theme.palette.bg }}>
                <EmptyState title="Pawn not found" hint={error || 'It may have been removed.'} />
            </View>
        );
    }

    const isActive = pawn.status === 'PAWN';

    return (
        <View style={{ flex: 1, backgroundColor: theme.palette.bg }}>
            <ScrollView
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
                <View style={{ gap: theme.spacing.xs }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                        <Txt variant="title">Pawn #{pawn.id}</Txt>
                        <Chip label={pawn.status} tone={statusTone(pawn.status)} />
                    </View>
                    <Txt variant="small" color="muted">Created {formatDateTime(pawn.createdAt)}</Txt>
                </View>

                {error ? <Banner tone="error">{error}</Banner> : null}

                <Card title="Customer">
                    <KVRow label="Name" value={pawn.customerName ?? '—'} last={!pawn.customerId} />
                    {pawn.customerId ? (
                        <Button
                            label="View customer"
                            variant="ghost"
                            size="sm"
                            onPress={() =>
                                router.push({
                                    pathname: '/customer/[id]',
                                    params: { id: String(pawn.customerId) },
                                })
                            }
                        />
                    ) : null}
                </Card>

                <Card title="Item">
                    <KVRow label="Type" value={pawn.itemType} />
                    <KVRow label="Description" value={pawn.itemDescription} />
                    <KVRow label="Weight" value={pawn.weight ? `${pawn.weight} g` : '—'} last />
                </Card>

                <Card title="Loan & interest">
                    <KVRow label="Principal" value={formatMMK(pawn.loanAmount)} />
                    <KVRow label="Rate" value={`${pawn.interestRate ?? 0}% / mo`} />
                    <KVRow label="Daily interest" value={formatMMK(dailyInterest)} />
                    <KVRow label="Days due" value={String(daysDue)} />
                    <KVRow
                        label="Interest due"
                        value={
                            <Txt weight="600" color={interestDue > 0 ? 'warning' : 'text'}>
                                {formatMMK(interestDue)}
                            </Txt>
                        }
                    />
                    <KVRow label="Last paid" value={formatDate(pawn.lastPaymentDate)} />
                    {pawn.maxAvailableAmount ? (
                        <KVRow label="Max available" value={formatMMK(pawn.maxAvailableAmount)} last />
                    ) : null}
                </Card>

                {isActive ? (
                    <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                        <Button label="Pay interest" onPress={() => setSheet('pay')} />
                        <Button label="Adjust" variant="secondary" onPress={() => setSheet('adjust')} />
                        <Button label="Redeem" variant="success" onPress={() => setSheet('redeem')} />
                    </View>
                ) : (
                    <Banner tone="info">This pawn is {pawn.status.toLowerCase()}.</Banner>
                )}

                <Card title={`Transactions · ${transactions.length}`}>
                    {transactions.length === 0 ? (
                        <Txt variant="small" color="subtle">No transactions yet.</Txt>
                    ) : (
                        transactions.map((tx, i) => (
                            <View key={tx.id} style={{ gap: 2 }}>
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Txt variant="small" weight="600">{tx.type}</Txt>
                                    <Txt variant="small" weight="600">{formatMMK(tx.amount)}</Txt>
                                </View>
                                <Txt variant="small" color="subtle">
                                    {formatDateTime(tx.date)}{tx.user ? ` · ${tx.user}` : ''}
                                </Txt>
                                {tx.description ? (
                                    <Txt variant="small" color="muted" numberOfLines={2}>
                                        {tx.description}
                                    </Txt>
                                ) : null}
                                {i < transactions.length - 1 ? <Divider /> : null}
                            </View>
                        ))
                    )}
                </Card>
            </ScrollView>

            <ActionSheet
                mode={sheet}
                pawn={pawn}
                daysDue={daysDue}
                interestDue={interestDue}
                redeemInterestDue={redeemInterestDue}
                onClose={() => setSheet(null)}
                onDone={async () => {
                    setSheet(null);
                    await load();
                }}
            />
        </View>
    );
}

type SheetProps = {
    mode: SheetMode;
    pawn: PawnRow;
    daysDue: number;
    interestDue: number;
    redeemInterestDue: number;
    onClose: () => void;
    onDone: () => void;
};

const ActionSheet: React.FC<SheetProps> = ({ mode, pawn, daysDue, interestDue, redeemInterestDue, onClose, onDone }) => {
    const theme = useTheme();
    const [days, setDays] = useState('');
    const [amount, setAmount] = useState('');
    const [adjustAmount, setAdjustAmount] = useState('');
    const [adjustType, setAdjustType] = useState<'PLUS_AMOUNT' | 'MINUS_AMOUNT'>('PLUS_AMOUNT');
    const [redeemDiscount, setRedeemDiscount] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState('');

    useEffect(() => {
        if (mode === 'pay') {
            setDays(String(daysDue));
            setAmount(String(interestDue));
            setErr('');
        }
        if (mode === 'adjust') {
            setAdjustAmount('');
            setAdjustType('PLUS_AMOUNT');
            setErr('');
        }
        if (mode === 'redeem') {
            setRedeemDiscount('0');
            setErr('');
        }
    }, [mode, daysDue, interestDue]);

    const derivedPayAmount = useMemo(() => {
        const d = Number(days);
        if (!Number.isFinite(d) || d <= 0) return 0;
        return calculateInterestByDays(pawn.loanAmount ?? 0, pawn.interestRate ?? 0, d);
    }, [days, pawn]);

    const totalRedeem = useMemo(() => {
        const principal = pawn.loanAmount ?? 0;
        const discount = Math.max(0, Number(redeemDiscount) || 0);
        return Math.max(0, principal + redeemInterestDue - discount);
    }, [pawn.loanAmount, redeemInterestDue, redeemDiscount]);

    const submit = async () => {
        setSubmitting(true);
        setErr('');
        try {
            if (mode === 'pay') {
                const d = Number(days);
                const a = Number(amount);
                if (!Number.isFinite(d) || d <= 0) throw new Error('Enter days');
                if (!Number.isFinite(a) || a <= 0) throw new Error('Enter amount');
                const res = await api.pawns.payInterest(pawn.id, d, a);
                if (!res.success) throw new Error(res.message || 'Failed');
            } else if (mode === 'adjust') {
                const a = Number(adjustAmount);
                if (!Number.isFinite(a) || a <= 0) throw new Error('Enter amount');
                const res = await api.pawns.adjust(pawn.id, a, adjustType);
                if (!res.success) throw new Error(res.message || 'Failed');
            } else if (mode === 'redeem') {
                const discount = Math.max(0, Number(redeemDiscount) || 0);
                const res = await api.pawns.redeem(pawn.id, totalRedeem + discount, discount);
                if (!res.success) throw new Error(res.message || 'Failed');
                Alert.alert('Redeemed', 'Pawn has been redeemed.');
            }
            onDone();
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : 'Action failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            visible={mode !== null}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ width: '100%' }}
                >
                    <View
                        style={[
                            styles.sheet,
                            { backgroundColor: theme.palette.bg, borderColor: theme.palette.border },
                        ]}
                    >
                        <View
                            style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <Txt variant="heading">
                                {mode === 'pay'
                                    ? 'Pay interest'
                                    : mode === 'adjust'
                                    ? 'Adjust principal'
                                    : 'Redeem'}
                            </Txt>
                            <Button label="Close" variant="ghost" size="sm" onPress={onClose} />
                        </View>

                        {mode === 'pay' ? (
                            <View style={{ gap: theme.spacing.sm }}>
                                <Txt variant="small" color="muted">
                                    {daysDue} day(s) due · Suggested {formatMMK(interestDue)}
                                </Txt>
                                <Field label="Days to pay">
                                    <Input
                                        value={days}
                                        onChangeText={(t) => {
                                            const clean = sanitizeNumericInput(t);
                                            setDays(clean);
                                            const d = Number(clean);
                                            if (Number.isFinite(d) && d > 0) {
                                                setAmount(
                                                    String(
                                                        calculateInterestByDays(
                                                            pawn.loanAmount ?? 0,
                                                            pawn.interestRate ?? 0,
                                                            d,
                                                        ),
                                                    ),
                                                );
                                            }
                                        }}
                                        keyboardType="numeric"
                                    />
                                </Field>
                                <Field
                                    label="Amount (MMK)"
                                    hint={`Suggested: ${formatMMK(derivedPayAmount)}`}
                                >
                                    <Input
                                        value={amount}
                                        onChangeText={(t) => setAmount(sanitizeNumericInput(t))}
                                        keyboardType="numeric"
                                    />
                                </Field>
                            </View>
                        ) : null}

                        {mode === 'adjust' ? (
                            <View style={{ gap: theme.spacing.sm }}>
                                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                                    <Chip
                                        label="Increase"
                                        active={adjustType === 'PLUS_AMOUNT'}
                                        onPress={() => setAdjustType('PLUS_AMOUNT')}
                                    />
                                    <Chip
                                        label="Decrease"
                                        active={adjustType === 'MINUS_AMOUNT'}
                                        onPress={() => setAdjustType('MINUS_AMOUNT')}
                                    />
                                </View>
                                <Field
                                    label="Amount (MMK)"
                                    hint="Requires interest-to-today paid first."
                                >
                                    <Input
                                        value={adjustAmount}
                                        onChangeText={(t) => setAdjustAmount(sanitizeNumericInput(t))}
                                        keyboardType="numeric"
                                    />
                                </Field>
                            </View>
                        ) : null}

                        {mode === 'redeem' ? (
                            <View style={{ gap: theme.spacing.sm }}>
                                <KVRow label="Principal" value={formatMMK(pawn.loanAmount)} />
                                <KVRow label="Interest due" value={formatMMK(redeemInterestDue)} />
                                <Field label="Discount on interest (MMK)">
                                    <Input
                                        value={redeemDiscount}
                                        onChangeText={(t) =>
                                            setRedeemDiscount(sanitizeNumericInput(t))
                                        }
                                        keyboardType="numeric"
                                    />
                                </Field>
                                <KVRow
                                    label="Customer pays"
                                    value={
                                        <Txt weight="600" color="accent">
                                            {formatMMK(totalRedeem)}
                                        </Txt>
                                    }
                                    last
                                />
                            </View>
                        ) : null}

                        {err ? <Banner tone="error">{err}</Banner> : null}

                        <Button
                            label={
                                submitting
                                    ? 'Saving…'
                                    : mode === 'redeem'
                                    ? 'Confirm redeem'
                                    : mode === 'adjust'
                                    ? adjustType === 'PLUS_AMOUNT'
                                        ? 'Increase principal'
                                        : 'Decrease principal'
                                    : 'Pay interest'
                            }
                            fullWidth
                            loading={submitting}
                            onPress={submit}
                            variant={mode === 'redeem' ? 'success' : 'primary'}
                        />
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
        padding: 16,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        gap: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
});
