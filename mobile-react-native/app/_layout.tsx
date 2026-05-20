import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function AuthGate() {
    const { user, loading } = useAuth();
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;
        const root = segments[0];
        const inAuthArea = root === '(tabs)' || root === 'pawn' || root === 'customer';
        if (!user && inAuthArea) {
            router.replace('/login');
        } else if (user && root === 'login') {
            router.replace('/(tabs)');
        } else if (user && !root) {
            router.replace('/(tabs)');
        } else if (!user && !root) {
            router.replace('/login');
        }
    }, [user, loading, segments, router]);

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="interest" options={{ headerShown: true, title: 'Interest' }} />
            <Stack.Screen name="redeem" options={{ headerShown: true, title: 'Redeem' }} />
            <Stack.Screen name="pawn/[id]" options={{ headerShown: true, title: 'Pawn' }} />
            <Stack.Screen
                name="pawn/new"
                options={{ headerShown: true, title: 'New Pawn', presentation: 'modal' }}
            />
            <Stack.Screen name="customer/[id]" options={{ headerShown: true, title: 'Customer' }} />
        </Stack>
    );
}

export default function RootLayout() {
    const colorScheme = useColorScheme();
    return (
        <SafeAreaProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                <AuthProvider>
                    <AuthGate />
                </AuthProvider>
            </ThemeProvider>
        </SafeAreaProvider>
    );
}
