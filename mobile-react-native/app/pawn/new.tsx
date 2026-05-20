import FaceCamera from '@/components/FaceCamera';
import PhotoCamera from '@/components/PhotoCamera';
import {
    Banner,
    Button,
    Card,
    Field,
    Input,
    Txt,
    useTheme,
} from '@/components/primitives';
import { api, type Customer } from '@/lib/api';
import { formatMMK, sanitizeNumericInput } from '@/lib/format';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

type InterestTier = {
    minAmount: number;
    rate: number;
};

const DEFAULT_ITEM_TYPES = ['Gold / Jewellery', 'Electronic', 'Other'];
const DEFAULT_INTEREST_TIERS: InterestTier[] = [
    { minAmount: 0, rate: 3 },
    { minAmount: 500001, rate: 2.5 },
    { minAmount: 1000001, rate: 2 },
];
const DEFAULT_GOLD_RATE = '80000';
const DEFAULT_ONE_KYAT_IN_GRAMS = '16.606';
const DEFAULT_GOLD_PRICE_PER_KYAT = '';
const GOLD_JEWELLERY_ITEM_TYPE = 'Gold / Jewellery';

const normalizeItemTypes = (value: unknown): string[] => {
    const raw = Array.isArray(value) ? value : DEFAULT_ITEM_TYPES;
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const item of raw) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        normalized.push(trimmed);
    }

    return normalized.length > 0 ? normalized : [...DEFAULT_ITEM_TYPES];
};

const normalizeInterestTier = (value: unknown): InterestTier | null => {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const minAmount = Number(record.minAmount);
    const rate = Number(record.rate);
    if (!Number.isFinite(minAmount) || !Number.isFinite(rate)) return null;
    return {
        minAmount: Math.max(0, Math.floor(minAmount)),
        rate: Math.max(0, rate),
    };
};

const normalizeInterestTiers = (value: unknown): InterestTier[] => {
    const raw = Array.isArray(value) ? value : DEFAULT_INTEREST_TIERS;
    const normalized = raw
        .map(normalizeInterestTier)
        .filter((tier): tier is InterestTier => tier != null)
        .sort((a, b) => a.minAmount - b.minAmount);
    return normalized.length > 0 ? normalized : [...DEFAULT_INTEREST_TIERS];
};

const normalizeInterestTiersByItemType = (
    value: unknown,
    itemTypes: string[],
    fallbackTiers: InterestTier[],
) => {
    const raw =
        value && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};
    const result: Record<string, InterestTier[]> = {};

    for (const itemType of itemTypes) {
        const match = Object.entries(raw).find(
            ([key]) => key.trim().toLowerCase() === itemType.trim().toLowerCase(),
        );
        result[itemType] = normalizeInterestTiers(match?.[1] ?? fallbackTiers);
    }

    return result;
};

const usesGoldJewelleryStorage = (itemType: string) =>
    itemType.trim().toLowerCase() === GOLD_JEWELLERY_ITEM_TYPE.toLowerCase();

const parseNumeric = (value: string) => Number.parseFloat(value || '0') || 0;

export default function NewPawnScreen() {
    const theme = useTheme();
    const router = useRouter();

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

    const [customerName, setCustomerName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [nrc, setNrc] = useState('');
    const [photo, setPhoto] = useState('');

    const [itemTypes, setItemTypes] = useState<string[]>(DEFAULT_ITEM_TYPES);
    const [itemType, setItemType] = useState(DEFAULT_ITEM_TYPES[0]);
    const [itemDescription, setItemDescription] = useState('');
    const [itemPhoto, setItemPhoto] = useState('');
    const [physicalNumber, setPhysicalNumber] = useState('');
    const [weight, setWeight] = useState('');
    const [nonGoldWeight, setNonGoldWeight] = useState('');
    const [kyat, setKyat] = useState('');
    const [pe, setPe] = useState('');
    const [yway, setYway] = useState('');
    const [nonGoldKyat, setNonGoldKyat] = useState('');
    const [nonGoldPe, setNonGoldPe] = useState('');
    const [nonGoldYway, setNonGoldYway] = useState('');

    const [loanAmount, setLoanAmount] = useState('');
    const [interestRate, setInterestRate] = useState('3');

    const [globalInterestTiers, setGlobalInterestTiers] =
        useState<InterestTier[]>(DEFAULT_INTEREST_TIERS);
    const [interestTiersByItemType, setInterestTiersByItemType] =
        useState<Record<string, InterestTier[]>>({});
    const [goldRate, setGoldRate] = useState(DEFAULT_GOLD_RATE);
    const [oneKyatInGrams, setOneKyatInGrams] = useState(DEFAULT_ONE_KYAT_IN_GRAMS);
    const [goldPricePerKyat, setGoldPricePerKyat] = useState(DEFAULT_GOLD_PRICE_PER_KYAT);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [showFaceCamera, setShowFaceCamera] = useState(false);
    const [showCustomerPhotoCamera, setShowCustomerPhotoCamera] = useState(false);
    const [showItemPhotoCamera, setShowItemPhotoCamera] = useState(false);
    const [showItemTypePicker, setShowItemTypePicker] = useState(false);
    const [faceDescriptor, setFaceDescriptor] = useState('');

    const usesStorage = useMemo(() => usesGoldJewelleryStorage(itemType), [itemType]);

    useEffect(() => {
        let cancelled = false;

        const loadInitialData = async () => {
            try {
                const [settingsRes, customersRes] = await Promise.all([
                    api.settings.getAppSettings(),
                    api.customers.list(),
                ]);

                if (cancelled) return;

                if (settingsRes.success) {
                    const nextItemTypes = normalizeItemTypes(settingsRes.settings?.itemTypes);
                    const nextGlobalTiers = normalizeInterestTiers(settingsRes.settings?.interestTiers);
                    setItemTypes(nextItemTypes);
                    setItemType((current) =>
                        nextItemTypes.some((entry) => entry.toLowerCase() === current.toLowerCase())
                            ? current
                            : nextItemTypes[0],
                    );
                    setGlobalInterestTiers(nextGlobalTiers);
                    setInterestTiersByItemType(
                        normalizeInterestTiersByItemType(
                            settingsRes.settings?.interestTiersByItemType,
                            nextItemTypes,
                            nextGlobalTiers,
                        ),
                    );
                    const nextGoldRate = settingsRes.settings?.goldRate?.trim() || DEFAULT_GOLD_RATE;
                    const nextOneKyatInGrams =
                        settingsRes.settings?.oneKyatInGrams?.trim() || DEFAULT_ONE_KYAT_IN_GRAMS;
                    const nextGoldPricePerKyat =
                        settingsRes.settings?.goldPricePerKyat?.trim() ||
                        String(Math.round(parseNumeric(nextGoldRate) * parseNumeric(nextOneKyatInGrams)));
                    setGoldRate(nextGoldRate);
                    setOneKyatInGrams(nextOneKyatInGrams);
                    setGoldPricePerKyat(nextGoldPricePerKyat);
                }

                if (customersRes.success && Array.isArray(customersRes.customers)) {
                    setCustomers(customersRes.customers);
                }
            } catch {
                // Keep defaults if loading fails.
            }
        };

        void loadInitialData();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (usesStorage) {
            setPhysicalNumber('');
            return;
        }
        setWeight('');
        setNonGoldWeight('');
        setKyat('');
        setPe('');
        setYway('');
        setNonGoldKyat('');
        setNonGoldPe('');
        setNonGoldYway('');
    }, [usesStorage]);

    const filteredCustomers = useMemo(() => {
        const query = customerName.trim().toLowerCase();
        if (!query) return [];
        return customers
            .filter((customer) => {
                const haystack = [
                    customer.name,
                    customer.phone,
                    customer.nrc,
                    customer.address,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(query);
            })
            .slice(0, 6);
    }, [customerName, customers]);

    const itemInterestTiers = useMemo(() => {
        const exact = Object.entries(interestTiersByItemType).find(
            ([key]) => key.trim().toLowerCase() === itemType.trim().toLowerCase(),
        );
        return [...(exact?.[1] ?? globalInterestTiers)];
    }, [globalInterestTiers, interestTiersByItemType, itemType]);

    useEffect(() => {
        const amount = parseNumeric(loanAmount);
        const tiers = [...itemInterestTiers].sort((a, b) => b.minAmount - a.minAmount);
        const match = tiers.find((tier) => amount >= tier.minAmount);
        setInterestRate(String(match?.rate ?? 3));
    }, [itemInterestTiers, loanAmount]);

    const updateMyanmarWeightFromGrams = (gramVal: string) => {
        const grams = parseNumeric(gramVal);
        const standard = parseNumeric(oneKyatInGrams);
        if (grams <= 0 || standard <= 0) {
            setKyat('');
            setPe('');
            setYway('');
            return;
        }
        const totalYway = (grams / standard) * 128;
        const nextKyat = Math.floor(totalYway / 128);
        const remainderYway = totalYway % 128;
        const nextPe = Math.floor(remainderYway / 8);
        const nextYway = remainderYway % 8;
        setKyat(String(nextKyat));
        setPe(String(nextPe));
        setYway(nextYway.toFixed(2));
    };

    const updateGramsFromMyanmar = (nextKyat: string, nextPe: string, nextYway: string) => {
        const standard = parseNumeric(oneKyatInGrams);
        if (standard <= 0) {
            setWeight('');
            return;
        }
        const totalYway =
            parseNumeric(nextKyat) * 128 + parseNumeric(nextPe) * 8 + parseNumeric(nextYway);
        const grams = (totalYway / 128) * standard;
        setWeight(grams > 0 ? grams.toFixed(3) : '');
    };

    const updateNonGoldMyanmarWeightFromGrams = (gramVal: string) => {
        const grams = parseNumeric(gramVal);
        const standard = parseNumeric(oneKyatInGrams);
        if (grams <= 0 || standard <= 0) {
            setNonGoldKyat('');
            setNonGoldPe('');
            setNonGoldYway('');
            return;
        }
        const totalYway = (grams / standard) * 128;
        const nextKyat = Math.floor(totalYway / 128);
        const remainderYway = totalYway % 128;
        const nextPe = Math.floor(remainderYway / 8);
        const nextYway = remainderYway % 8;
        setNonGoldKyat(String(nextKyat));
        setNonGoldPe(String(nextPe));
        setNonGoldYway(nextYway.toFixed(2));
    };

    const updateNonGoldGramsFromMyanmar = (
        nextKyat: string,
        nextPe: string,
        nextYway: string,
    ) => {
        const standard = parseNumeric(oneKyatInGrams);
        if (standard <= 0) {
            setNonGoldWeight('');
            return;
        }
        const totalYway =
            parseNumeric(nextKyat) * 128 + parseNumeric(nextPe) * 8 + parseNumeric(nextYway);
        const grams = (totalYway / 128) * standard;
        setNonGoldWeight(grams > 0 ? grams.toFixed(3) : '');
    };

    const handleGramChange = (value: string) => {
        const sanitized = sanitizeNumericInput(value, true);
        setWeight(sanitized);
        updateMyanmarWeightFromGrams(sanitized);
    };

    const handleMyanmarChange = (
        field: 'kyat' | 'pe' | 'yway',
        value: string,
    ) => {
        const sanitized = sanitizeNumericInput(value, true);
        const nextKyat = field === 'kyat' ? sanitized : kyat;
        const nextPe = field === 'pe' ? sanitized : pe;
        const nextYway = field === 'yway' ? sanitized : yway;
        setKyat(nextKyat);
        setPe(nextPe);
        setYway(nextYway);
        updateGramsFromMyanmar(nextKyat, nextPe, nextYway);
    };

    const handleNonGoldGramChange = (value: string) => {
        const sanitized = sanitizeNumericInput(value, true);
        setNonGoldWeight(sanitized);
        updateNonGoldMyanmarWeightFromGrams(sanitized);
    };

    const handleNonGoldMyanmarChange = (
        field: 'kyat' | 'pe' | 'yway',
        value: string,
    ) => {
        const sanitized = sanitizeNumericInput(value, true);
        const nextKyat = field === 'kyat' ? sanitized : nonGoldKyat;
        const nextPe = field === 'pe' ? sanitized : nonGoldPe;
        const nextYway = field === 'yway' ? sanitized : nonGoldYway;
        setNonGoldKyat(nextKyat);
        setNonGoldPe(nextPe);
        setNonGoldYway(nextYway);
        updateNonGoldGramsFromMyanmar(nextKyat, nextPe, nextYway);
    };

    const handleCustomerSelect = (customer: Customer) => {
        setSelectedCustomer(customer);
        setCustomerName(customer.name);
        setPhone(customer.phone || '');
        setAddress(customer.address || '');
        setNrc(customer.nrc || '');
        setPhoto(customer.photo || '');
        setShowCustomerSuggestions(false);
    };

    const handleCustomerNameChange = (value: string) => {
        setCustomerName(value);
        setShowCustomerSuggestions(Boolean(value.trim()));
        if (selectedCustomer && value !== selectedCustomer.name) {
            setSelectedCustomer(null);
        }
    };

    const clearSelectedCustomer = () => {
        setSelectedCustomer(null);
        setShowCustomerSuggestions(false);
    };

    const netWeight = useMemo(() => {
        if (!usesStorage) return 0;
        return Math.max(0, parseNumeric(weight) - parseNumeric(nonGoldWeight));
    }, [nonGoldWeight, usesStorage, weight]);

    const calculatedMaxAvailable = useMemo(() => {
        if (!usesStorage) return 0;
        const standard = parseNumeric(oneKyatInGrams);
        const kyattharRate = parseNumeric(goldPricePerKyat);
        const ratePerGram =
            kyattharRate > 0 && standard > 0 ? kyattharRate / standard : parseNumeric(goldRate);
        return Math.round(netWeight * ratePerGram);
    }, [goldPricePerKyat, goldRate, netWeight, oneKyatInGrams, usesStorage]);

    const maxAvailableLabel = 'Max available amount (MMK)';
    const loanAmountNumber = Number(loanAmount) || 0;
    const loanAmountError =
        usesStorage && calculatedMaxAvailable > 0 && loanAmountNumber > calculatedMaxAvailable
            ? `Loan amount cannot be greater than ${formatMMK(calculatedMaxAvailable)}`
            : '';

    const handleLoanAmountChange = (value: string) => {
        const sanitized = sanitizeNumericInput(value);
        const nextAmount = Number(sanitized) || 0;
        if (usesStorage && calculatedMaxAvailable > 0 && nextAmount > calculatedMaxAvailable) {
            setLoanAmount(String(calculatedMaxAvailable));
            return;
        }
        setLoanAmount(sanitized);
    };

    const canSubmit = useMemo(
        () =>
            customerName.trim().length > 0 &&
            itemType.trim().length > 0 &&
            itemDescription.trim().length > 0 &&
            Number(loanAmount) > 0 &&
            !loanAmountError &&
            (usesStorage || physicalNumber.trim().length > 0),
        [customerName, itemDescription, itemType, loanAmount, loanAmountError, physicalNumber, usesStorage],
    );

    const submit = async () => {
        if (!canSubmit || submitting) return;
        if (loanAmountError) {
            setError(loanAmountError);
            return;
        }
        setSubmitting(true);
        setError('');
        const payload = {
            customer: {
                id: selectedCustomer?.id,
                name: customerName.trim(),
                phone: phone.trim() || undefined,
                address: address.trim() || undefined,
                nrc: nrc.trim() || undefined,
                photo: photo.trim() || undefined,
                faceDescriptor: faceDescriptor.trim() || undefined,
            },
            item: {
                type: itemType.trim(),
                description: itemDescription.trim(),
                photo: itemPhoto.trim() || undefined,
                physicalNumber: usesStorage ? undefined : physicalNumber.trim() || undefined,
                weight: usesStorage && weight ? Number(weight) : undefined,
                nonGoldWeight: usesStorage && nonGoldWeight ? Number(nonGoldWeight) : undefined,
            },
            loanAmount: Number(loanAmount),
            maxAvailableAmount: usesStorage ? calculatedMaxAvailable || undefined : undefined,
            interestRate: interestRate ? Number(interestRate) : undefined,
        };
        const res = await api.pawns.create(payload);
        setSubmitting(false);
        if (!res.success) {
            setError(res.message || 'Could not create pawn');
            return;
        }
        Alert.alert('Pawn created', `Pawn #${res.pawnId} has been created.`, [
            {
                text: 'View',
                onPress: () =>
                    router.replace({
                        pathname: '/pawn/[id]',
                        params: { id: String(res.pawnId) },
                    }),
            },
            { text: 'Done', onPress: () => router.back(), style: 'cancel' },
        ]);
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: theme.palette.bg }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                contentContainerStyle={{
                    padding: theme.spacing.lg,
                    gap: theme.spacing.md,
                    paddingBottom: 48,
                }}
                keyboardShouldPersistTaps="handled"
            >
                <FaceCamera
                    visible={showFaceCamera}
                    onCancel={() => setShowFaceCamera(false)}
                    onMatch={(photoBase64, descriptor, matchedCustomer) => {
                        setShowFaceCamera(false);
                        if (matchedCustomer) {
                            Alert.alert('Customer Details Loaded', `Matched: ${matchedCustomer.name}`);
                            setCustomerName(matchedCustomer.name);
                            setSelectedCustomer({
                                id: matchedCustomer.id,
                                name: matchedCustomer.name,
                                phone: matchedCustomer.phone,
                                address: matchedCustomer.address,
                                nrc: matchedCustomer.nrc,
                                photo: matchedCustomer.photo,
                            });
                            setPhone(matchedCustomer.phone || '');
                            setAddress(matchedCustomer.address || '');
                            setNrc(matchedCustomer.nrc || '');
                        } else {
                            Alert.alert('New Face Identified', 'Adding new customer photo');
                        }
                        setPhoto(photoBase64);
                        setFaceDescriptor(descriptor);
                    }}
                />
                <PhotoCamera
                    visible={showCustomerPhotoCamera}
                    title="Customer Photo"
                    facing="front"
                    onCancel={() => setShowCustomerPhotoCamera(false)}
                    onCapture={(photoBase64) => {
                        setShowCustomerPhotoCamera(false);
                        setPhoto(photoBase64);
                    }}
                />
                <PhotoCamera
                    visible={showItemPhotoCamera}
                    title="Item Photo"
                    facing="back"
                    onCancel={() => setShowItemPhotoCamera(false)}
                    onCapture={(photoBase64) => {
                        setShowItemPhotoCamera(false);
                        setItemPhoto(photoBase64);
                    }}
                />

                <Modal
                    visible={showItemTypePicker}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setShowItemTypePicker(false)}
                >
                    <View style={styles.backdrop}>
                        <View
                            style={[
                                styles.sheet,
                                {
                                    backgroundColor: theme.palette.bg,
                                    borderColor: theme.palette.border,
                                },
                            ]}
                        >
                            <View style={styles.sheetHeader}>
                                <Txt variant="heading">Select item type</Txt>
                                <Button
                                    label="Close"
                                    variant="ghost"
                                    size="sm"
                                    onPress={() => setShowItemTypePicker(false)}
                                />
                            </View>
                            <ScrollView contentContainerStyle={{ gap: theme.spacing.sm }}>
                                {itemTypes.map((type) => {
                                    const active = type.toLowerCase() === itemType.toLowerCase();
                                    return (
                                        <Pressable
                                            key={type}
                                            onPress={() => {
                                                setItemType(type);
                                                setShowItemTypePicker(false);
                                            }}
                                            style={({ pressed }) => [
                                                styles.optionRow,
                                                {
                                                    backgroundColor: active
                                                        ? theme.palette.surfaceAlt
                                                        : theme.palette.surface,
                                                    borderColor: active
                                                        ? theme.palette.borderStrong
                                                        : theme.palette.border,
                                                    opacity: pressed ? 0.85 : 1,
                                                },
                                            ]}
                                        >
                                            <Txt variant="body" weight={active ? '600' : '500'}>
                                                {type}
                                            </Txt>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Txt variant="heading">Customer</Txt>
                    <Button
                        label="Scan Face"
                        onPress={() => setShowFaceCamera(true)}
                        variant="secondary"
                        size="sm"
                    />
                </View>
                <Card>
                    <Field hint="Type to search existing customers by name, phone, NRC, or address.">
                        <View style={styles.labelRow}>
                            <Txt variant="small" color="muted" weight="500">Name</Txt>
                            {selectedCustomer ? (
                                <Txt variant="small" color="success" weight="600">
                                    Existing customer
                                </Txt>
                            ) : null}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                            <View style={{ flex: 1 }}>
                                <Input
                                    value={customerName}
                                    onChangeText={handleCustomerNameChange}
                                    placeholder="Full name"
                                    onFocus={() => setShowCustomerSuggestions(filteredCustomers.length > 0)}
                                    editable={!selectedCustomer}
                                />
                            </View>
                            {selectedCustomer ? (
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="Deselect existing customer"
                                    onPress={clearSelectedCustomer}
                                    style={({ pressed }) => [
                                        styles.clearCustomerButton,
                                        {
                                            borderColor: theme.palette.border,
                                            backgroundColor: theme.palette.surfaceAlt,
                                            opacity: pressed ? 0.8 : 1,
                                        },
                                    ]}
                                >
                                    <Txt variant="body" weight="700">X</Txt>
                                </Pressable>
                            ) : null}
                        </View>
                        {showCustomerSuggestions && filteredCustomers.length > 0 ? (
                            <View style={styles.suggestions}>
                                {filteredCustomers.map((customer) => (
                                    <Pressable
                                        key={customer.id}
                                        onPress={() => handleCustomerSelect(customer)}
                                        style={({ pressed }) => [
                                            styles.suggestionRow,
                                            {
                                                borderColor: theme.palette.border,
                                                opacity: pressed ? 0.85 : 1,
                                            },
                                        ]}
                                    >
                                        <Txt variant="body" weight="600">{customer.name}</Txt>
                                        <Txt variant="small" color="muted">
                                            {[customer.phone, customer.nrc].filter(Boolean).join(' · ') || customer.address || 'Existing customer'}
                                        </Txt>
                                    </Pressable>
                                ))}
                            </View>
                        ) : null}
                    </Field>
                    <Field label="Phone">
                        <Input
                            value={phone}
                            onChangeText={(t) => setPhone(sanitizeNumericInput(t))}
                            placeholder="09xxxxxxxxx"
                            keyboardType="phone-pad"
                            editable={!selectedCustomer}
                        />
                    </Field>
                    <Field label="NRC">
                        <Input
                            value={nrc}
                            onChangeText={setNrc}
                            placeholder="12/ABC(N)123456"
                            autoCapitalize="characters"
                            editable={!selectedCustomer}
                        />
                    </Field>
                    <Field label="Address">
                        <Input
                            value={address}
                            onChangeText={setAddress}
                            placeholder="Township, city"
                            multiline
                            editable={!selectedCustomer}
                        />
                    </Field>
                    <Field label="Photo">
                        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
                            <Button
                                label={photo ? 'Retake photo' : 'Take photo'}
                                variant="secondary"
                                size="sm"
                                onPress={() => setShowCustomerPhotoCamera(true)}
                                disabled={Boolean(selectedCustomer)}
                            />
                            {photo ? (
                                <Image
                                    source={{ uri: photo }}
                                    style={styles.photoPreview}
                                />
                            ) : null}
                        </View>
                    </Field>
                </Card>

                <Txt variant="heading">Item</Txt>
                <Card>
                    <Field label="Type" hint="Loaded from configured pawn item types.">
                        <Pressable
                            onPress={() => setShowItemTypePicker(true)}
                            style={{
                                minHeight: 44,
                                paddingHorizontal: theme.spacing.md,
                                borderRadius: theme.radius.md,
                                borderWidth: StyleSheet.hairlineWidth,
                                borderColor: theme.palette.border,
                                backgroundColor: theme.palette.surface,
                                justifyContent: 'center',
                            }}
                        >
                            <Txt variant="body">{itemType || 'Select item type'}</Txt>
                        </Pressable>
                    </Field>
                    <Field label="Description">
                        <Input
                            value={itemDescription}
                            onChangeText={setItemDescription}
                            placeholder="18k ring, 2 pcs"
                            multiline
                        />
                    </Field>
                    <Field label="Item Photo">
                        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
                            <Button
                                label={itemPhoto ? 'Retake photo' : 'Take photo'}
                                variant="secondary"
                                size="sm"
                                onPress={() => setShowItemPhotoCamera(true)}
                            />
                            {itemPhoto ? (
                                <Image
                                    source={{ uri: itemPhoto }}
                                    style={styles.photoPreview}
                                />
                            ) : null}
                        </View>
                    </Field>

                    {!usesStorage ? (
                        <Field label="Physical number" hint="Required for non-gold item types.">
                            <Input
                                value={physicalNumber}
                                onChangeText={setPhysicalNumber}
                                placeholder="A 150"
                                autoCapitalize="characters"
                            />
                        </Field>
                    ) : (
                        <>
                            <Field label="Weight (g)">
                                <Input
                                    value={weight}
                                    onChangeText={handleGramChange}
                                    placeholder="0"
                                    keyboardType="decimal-pad"
                                />
                            </Field>
                            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                                <View style={{ flex: 1 }}>
                                    <Field label="Kyat">
                                        <Input
                                            value={kyat}
                                            onChangeText={(value) => handleMyanmarChange('kyat', value)}
                                            keyboardType="decimal-pad"
                                            placeholder="0"
                                        />
                                    </Field>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Field label="Pe">
                                        <Input
                                            value={pe}
                                            onChangeText={(value) => handleMyanmarChange('pe', value)}
                                            keyboardType="decimal-pad"
                                            placeholder="0"
                                        />
                                    </Field>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Field label="Yway">
                                        <Input
                                            value={yway}
                                            onChangeText={(value) => handleMyanmarChange('yway', value)}
                                            keyboardType="decimal-pad"
                                            placeholder="0"
                                        />
                                    </Field>
                                </View>
                            </View>
                            <Field label="Non-gold weight (g)">
                                <Input
                                    value={nonGoldWeight}
                                    onChangeText={handleNonGoldGramChange}
                                    placeholder="0"
                                    keyboardType="decimal-pad"
                                />
                            </Field>
                            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                                <View style={{ flex: 1 }}>
                                    <Field label="Non-gold kyat">
                                        <Input
                                            value={nonGoldKyat}
                                            onChangeText={(value) => handleNonGoldMyanmarChange('kyat', value)}
                                            keyboardType="decimal-pad"
                                            placeholder="0"
                                        />
                                    </Field>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Field label="Non-gold pe">
                                        <Input
                                            value={nonGoldPe}
                                            onChangeText={(value) => handleNonGoldMyanmarChange('pe', value)}
                                            keyboardType="decimal-pad"
                                            placeholder="0"
                                        />
                                    </Field>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Field label="Non-gold yway">
                                        <Input
                                            value={nonGoldYway}
                                            onChangeText={(value) => handleNonGoldMyanmarChange('yway', value)}
                                            keyboardType="decimal-pad"
                                            placeholder="0"
                                        />
                                    </Field>
                                </View>
                            </View>
                            <Field label="Net gold weight (g)">
                                <View
                                    style={{
                                        minHeight: 44,
                                        paddingHorizontal: theme.spacing.md,
                                        borderRadius: theme.radius.md,
                                        borderWidth: StyleSheet.hairlineWidth,
                                        borderColor: theme.palette.border,
                                        backgroundColor: theme.palette.surface,
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Txt variant="body" weight="600">
                                        {netWeight.toFixed(3)}
                                    </Txt>
                                </View>
                            </Field>
                        </>
                    )}
                </Card>

                <Txt variant="heading">Loan</Txt>
                <Card>
                    {usesStorage ? (
                        <Field label="Gold Rate" hint="1 Kyatthar rate, loaded from Settings.">
                            <Input
                                value={goldPricePerKyat}
                                onChangeText={(value) => setGoldPricePerKyat(sanitizeNumericInput(value))}
                                keyboardType="numeric"
                                placeholder="3000000"
                            />
                        </Field>
                    ) : null}
                    <Field label="Loan amount (MMK)">
                        <Input
                            value={loanAmount}
                            onChangeText={handleLoanAmountChange}
                            placeholder="500000"
                            keyboardType="numeric"
                        />
                        {loanAmountError ? (
                            <Txt variant="small" color="error">{loanAmountError}</Txt>
                        ) : null}
                    </Field>
                    <Field
                        label={maxAvailableLabel}
                        hint={usesStorage ? undefined : 'Not used for non-gold item types.'}
                    >
                        <View
                            style={{
                                minHeight: 44,
                                paddingHorizontal: theme.spacing.md,
                                borderRadius: theme.radius.md,
                                borderWidth: StyleSheet.hairlineWidth,
                                borderColor: theme.palette.border,
                                backgroundColor: theme.palette.surface,
                                justifyContent: 'center',
                            }}
                        >
                            <Txt variant="body" color={usesStorage ? 'text' : 'muted'}>
                                {usesStorage ? formatMMK(calculatedMaxAvailable) : '—'}
                            </Txt>
                        </View>
                    </Field>
                    <Field label="Interest Rate">
                        <Input
                            value={interestRate}
                            onChangeText={(t) => setInterestRate(sanitizeNumericInput(t, true))}
                            placeholder="3"
                            keyboardType="decimal-pad"
                        />
                    </Field>
                </Card>

                {error ? <Banner tone="error">{error}</Banner> : null}

                <Button
                    label={submitting ? 'Creating…' : 'Create pawn'}
                    onPress={submit}
                    disabled={!canSubmit || submitting}
                    loading={submitting}
                    fullWidth
                    size="lg"
                />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

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
        maxHeight: '70%',
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    optionRow: {
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
    },
    suggestions: {
        marginTop: 8,
        gap: 8,
    },
    suggestionRow: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: 'transparent',
        gap: 2,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    clearCustomerButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
    },
    photoPreview: {
        width: 56,
        height: 56,
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(0,0,0,0.12)',
        backgroundColor: 'rgba(0,0,0,0.04)',
    },
});
