import {
    Banner,
    Button,
    Card,
    Field,
    Input,
    KVRow,
    Txt,
    useTheme,
} from '@/components/primitives';
import { api, getApiBaseUrl, getDefaultApiBaseUrl, setApiBaseUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

export default function SettingsScreen() {
    const theme = useTheme();
    const { user, logout } = useAuth();
    const [apiUrl, setApiUrl] = useState('');
    const [savedUrl, setSavedUrl] = useState('');
    const [pinging, setPinging] = useState(false);
    const [result, setResult] = useState<
        { tone: 'success' | 'error' | 'info'; text: string } | null
    >(null);

    useEffect(() => {
        getApiBaseUrl().then((u) => {
            setApiUrl(u);
            setSavedUrl(u);
        });
    }, []);

    const save = async () => {
        const clean = apiUrl.trim();
        await setApiBaseUrl(clean);
        const fresh = await getApiBaseUrl();
        setApiUrl(fresh);
        setSavedUrl(fresh);
        setResult({ tone: 'success', text: `Saved. Using ${fresh}` });
    };

    const testConnection = async () => {
        setPinging(true);
        setResult(null);
        const res = await api.health();
        setPinging(false);
        if (res.success) setResult({ tone: 'success', text: 'API is reachable.' });
        else setResult({ tone: 'error', text: res.message || 'Unreachable' });
    };

    const resetDefault = async () => {
        const def = getDefaultApiBaseUrl();
        setApiUrl(def);
        await setApiBaseUrl('');
        setSavedUrl(def);
        setResult({ tone: 'info', text: `Reset to default: ${def}` });
    };

    const onLogout = () => {
        Alert.alert('Sign out?', 'You will need to log in again.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => logout() },
        ]);
    };

    return (
        <ScrollView
            style={{ backgroundColor: theme.palette.bg }}
            contentContainerStyle={{
                padding: theme.spacing.lg,
                gap: theme.spacing.md,
                paddingBottom: 32,
            }}
        >
            <Card title="Account">
                <KVRow label="Name" value={user?.name ?? '—'} />
                <KVRow label="Role" value={user?.level ?? '—'} last />
                <Button label="Sign out" variant="danger" onPress={onLogout} />
            </Card>

            <Card
                title="API server"
                subtitle="LAN IP for physical phones (e.g. 192.168.x.x), localhost for simulators."
            >
                <Field label="Base URL" hint="Include scheme and port, no trailing slash.">
                    <Input
                        value={apiUrl}
                        onChangeText={setApiUrl}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        placeholder="http://host:8787"
                    />
                </Field>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                    <Button
                        label="Save"
                        onPress={save}
                        disabled={apiUrl.trim() === savedUrl.trim()}
                    />
                    <Button
                        label={pinging ? 'Testing…' : 'Test'}
                        variant="secondary"
                        onPress={testConnection}
                        loading={pinging}
                    />
                    <Button label="Reset" variant="ghost" onPress={resetDefault} />
                </View>
                {result ? <Banner tone={result.tone}>{result.text}</Banner> : null}
                <Txt variant="small" color="subtle">
                    Current: {savedUrl}
                </Txt>
            </Card>

            <Card title="About">
                <KVRow label="App" value="Pawn Mobile" />
                <KVRow label="Features" value="Pawns, batch interest, batch redeem, reports" last />
            </Card>
        </ScrollView>
    );
}
