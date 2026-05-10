import { Screen } from '@/components/Screen';
import { Banner, Button, Card, Field, Input, Txt, useTheme } from '@/components/primitives';
import { getApiBaseUrl, getDefaultApiBaseUrl, setApiBaseUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

export default function LoginScreen() {
    const theme = useTheme();
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [apiUrl, setApiUrlLocal] = useState('');
    const [savingUrl, setSavingUrl] = useState(false);

    useEffect(() => {
        getApiBaseUrl().then(setApiUrlLocal);
    }, []);

    const handleLogin = async () => {
        if (!username || !password) {
            setError('Enter username and password');
            return;
        }
        setSubmitting(true);
        setError('');
        const res = await login(username.trim(), password);
        setSubmitting(false);
        if (!res.success) setError(res.message || 'Login failed');
    };

    const handleSaveUrl = async () => {
        setSavingUrl(true);
        await setApiBaseUrl(apiUrl);
        const next = await getApiBaseUrl();
        setApiUrlLocal(next);
        setSavingUrl(false);
        Alert.alert('Saved', `API server set to ${next}`);
    };

    return (
        <Screen scroll>
            <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.lg }}>
                <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.lg }}>
                    <Txt variant="title">Pawn Shop</Txt>
                    <Txt color="muted">Sign in to continue</Txt>
                </View>

                <Card>
                    <Field label="Username">
                        <Input
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={username}
                            onChangeText={setUsername}
                            placeholder="e.g. admin"
                            returnKeyType="next"
                        />
                    </Field>
                    <Field label="Password">
                        <Input
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={password}
                            onChangeText={setPassword}
                            placeholder="••••••"
                            returnKeyType="go"
                            onSubmitEditing={handleLogin}
                        />
                    </Field>
                    {error ? <Banner tone="error">{error}</Banner> : null}
                    <Button
                        label={submitting ? 'Signing in…' : 'Sign in'}
                        onPress={handleLogin}
                        loading={submitting}
                        fullWidth
                    />
                </Card>

                <Pressable onPress={() => setShowSettings((s) => !s)}>
                    <Txt variant="small" color="accent" style={{ textAlign: 'center' }}>
                        {showSettings ? 'Hide advanced settings' : 'Advanced: change API server'}
                    </Txt>
                </Pressable>

                {showSettings ? (
                    <Card title="API server">
                        <Field label="Base URL" hint={`Default: ${getDefaultApiBaseUrl()}`}>
                            <Input
                                value={apiUrl}
                                onChangeText={setApiUrlLocal}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                                placeholder="http://192.168.1.50:8787"
                            />
                        </Field>
                        <Button
                            label={savingUrl ? 'Saving…' : 'Save'}
                            onPress={handleSaveUrl}
                            loading={savingUrl}
                            variant="secondary"
                            fullWidth
                        />
                        <Txt variant="small" color="subtle">
                            Tip: for a physical phone, set this to your computer&apos;s LAN IP (same Wi-Fi) — e.g. http://192.168.x.x:8787.
                        </Txt>
                    </Card>
                ) : null}
            </View>
        </Screen>
    );
}
