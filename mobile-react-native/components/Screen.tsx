import { useColorScheme } from '@/hooks/use-color-scheme';
import { makeTheme } from '@/lib/theme';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
    children: React.ReactNode;
    scroll?: boolean;
    contentStyle?: ViewStyle;
    edges?: ('top' | 'bottom' | 'left' | 'right')[];
    padded?: boolean;
};

export const Screen: React.FC<Props> = ({ children, scroll, contentStyle, edges, padded = true }) => {
    const scheme = useColorScheme();
    const theme = useMemo(() => makeTheme(scheme === 'dark'), [scheme]);

    const inner = (
        <View
            style={[
                { flex: 1, padding: padded ? theme.spacing.lg : 0, gap: theme.spacing.md },
                contentStyle,
            ]}
        >
            {children}
        </View>
    );

    return (
        <SafeAreaView
            style={[styles.safe, { backgroundColor: theme.palette.bg }]}
            edges={edges ?? ['top', 'left', 'right']}
        >
            <StatusBar style={theme.isDark ? 'light' : 'dark'} />
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {scroll ? (
                    <ScrollView
                        contentContainerStyle={{ flexGrow: 1 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        {inner}
                    </ScrollView>
                ) : (
                    inner
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safe: { flex: 1 },
});
