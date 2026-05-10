import {
    Banner,
    Button,
    Card,
    Field,
    Input,
    Txt,
    useTheme,
} from '@/components/primitives';
import { api } from '@/lib/api';
import { sanitizeNumericInput } from '@/lib/format';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View, TouchableOpacity } from 'react-native';
import FaceCamera from '@/components/FaceCamera';
import { ScanFace } from 'lucide-react-native';

export default function NewPawnScreen() {
    const theme = useTheme();
    const router = useRouter();

    const [customerName, setCustomerName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [nrc, setNrc] = useState('');
    const [photo, setPhoto] = useState('');

    const [itemType, setItemType] = useState('');
    const [itemDescription, setItemDescription] = useState('');
    const [weight, setWeight] = useState('');
    const [nonGoldWeight, setNonGoldWeight] = useState('');

    const [loanAmount, setLoanAmount] = useState('');
    const [maxAvailableAmount, setMaxAvailableAmount] = useState('');
    const [interestRate, setInterestRate] = useState('3');

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [showFaceCamera, setShowFaceCamera] = useState(false);
    const [faceDescriptor, setFaceDescriptor] = useState('');

    const canSubmit = useMemo(
        () =>
            customerName.trim().length > 0 &&
            itemType.trim().length > 0 &&
            itemDescription.trim().length > 0 &&
            Number(loanAmount) > 0,
        [customerName, itemType, itemDescription, loanAmount],
    );

    const submit = async () => {
        if (!canSubmit || submitting) return;
        setSubmitting(true);
        setError('');
        const payload = {
            customer: {
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
                weight: weight ? Number(weight) : undefined,
                nonGoldWeight: nonGoldWeight ? Number(nonGoldWeight) : undefined,
            },
            loanAmount: Number(loanAmount),
            maxAvailableAmount: maxAvailableAmount ? Number(maxAvailableAmount) : undefined,
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
                            Alert.alert("Customer Details Loaded", `Matched: ${matchedCustomer.name}`);
                            setCustomerName(matchedCustomer.name);
                            // We can use their existing properties but limit to name/phone.
                        } else {
                            Alert.alert("New Face Identified", "Adding new customer photo");
                        }
                        setPhoto(photoBase64);
                        setFaceDescriptor(descriptor);
                    }}
                />

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
                    <Field label="Name">
                        <Input value={customerName} onChangeText={setCustomerName} placeholder="Full name" />
                    </Field>
                    <Field label="Phone">
                        <Input
                            value={phone}
                            onChangeText={(t) => setPhone(sanitizeNumericInput(t))}
                            placeholder="09xxxxxxxxx"
                            keyboardType="phone-pad"
                        />
                    </Field>
                    <Field label="NRC">
                        <Input
                            value={nrc}
                            onChangeText={setNrc}
                            placeholder="12/ABC(N)123456"
                            autoCapitalize="characters"
                        />
                    </Field>
                    <Field label="Address">
                        <Input
                            value={address}
                            onChangeText={setAddress}
                            placeholder="Township, city"
                            multiline
                        />
                    </Field>
                    <Field label="Photo URL (optional)">
                        <Input
                            value={photo}
                            onChangeText={setPhoto}
                            placeholder="https://..."
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </Field>
                </Card>

                <Txt variant="heading">Item</Txt>
                <Card>
                    <Field label="Type">
                        <Input value={itemType} onChangeText={setItemType} placeholder="Gold, Jade, Phone…" />
                    </Field>
                    <Field label="Description">
                        <Input
                            value={itemDescription}
                            onChangeText={setItemDescription}
                            placeholder="18k ring, 2 pcs"
                            multiline
                        />
                    </Field>
                    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                        <View style={{ flex: 1 }}>
                            <Field label="Weight (g)">
                                <Input
                                    value={weight}
                                    onChangeText={(t) => setWeight(sanitizeNumericInput(t, true))}
                                    placeholder="0"
                                    keyboardType="decimal-pad"
                                />
                            </Field>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Field label="Non-gold (g)">
                                <Input
                                    value={nonGoldWeight}
                                    onChangeText={(t) => setNonGoldWeight(sanitizeNumericInput(t, true))}
                                    placeholder="0"
                                    keyboardType="decimal-pad"
                                />
                            </Field>
                        </View>
                    </View>
                </Card>

                <Txt variant="heading">Loan</Txt>
                <Card>
                    <Field label="Loan amount (MMK)">
                        <Input
                            value={loanAmount}
                            onChangeText={(t) => setLoanAmount(sanitizeNumericInput(t))}
                            placeholder="500000"
                            keyboardType="numeric"
                        />
                    </Field>
                    <Field label="Max available (MMK)" hint="Optional. Cap for future principal increases.">
                        <Input
                            value={maxAvailableAmount}
                            onChangeText={(t) => setMaxAvailableAmount(sanitizeNumericInput(t))}
                            placeholder="700000"
                            keyboardType="numeric"
                        />
                    </Field>
                    <Field label="Interest rate (% / month)">
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
