import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatMMK } from '@/lib/format';
import { makeTheme, type Theme } from '@/lib/theme';
import React, { useMemo } from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    TextStyle,
    View,
    ViewStyle,
} from 'react-native';

export const useTheme = (): Theme => {
    const scheme = useColorScheme();
    return useMemo(() => makeTheme(scheme === 'dark'), [scheme]);
};

type TxtProps = {
    children: React.ReactNode;
    variant?: 'title' | 'heading' | 'subheading' | 'body' | 'small' | 'micro' | 'mono';
    color?: 'text' | 'muted' | 'subtle' | 'accent' | 'success' | 'error' | 'warning';
    weight?: '400' | '500' | '600' | '700';
    style?: TextStyle;
    numberOfLines?: number;
};

export const Txt: React.FC<TxtProps> = ({
    children,
    variant = 'body',
    color = 'text',
    weight,
    style,
    numberOfLines,
}) => {
    const theme = useTheme();
    const colorMap = {
        text: theme.palette.text,
        muted: theme.palette.textMuted,
        subtle: theme.palette.textSubtle,
        accent: theme.palette.accent,
        success: theme.palette.success,
        error: theme.palette.error,
        warning: theme.palette.warning,
    } as const;
    const typo = theme.typography[variant];
    return (
        <Text
            numberOfLines={numberOfLines}
            style={[
                { color: colorMap[color] },
                typo,
                variant === 'micro' ? { textTransform: 'uppercase' } : null,
                weight ? { fontWeight: weight } : null,
                style,
            ]}
        >
            {children}
        </Text>
    );
};

type ButtonProps = {
    label: string;
    onPress?: () => void;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    style?: ViewStyle;
    size?: 'md' | 'sm' | 'lg';
};

export const Button: React.FC<ButtonProps> = ({
    label,
    onPress,
    variant = 'primary',
    disabled,
    loading,
    fullWidth,
    style,
    size = 'md',
}) => {
    const theme = useTheme();
    const p = theme.palette;
    const bgMap = {
        primary: p.accent,
        secondary: p.surfaceAlt,
        ghost: 'transparent',
        danger: p.error,
        success: p.success,
    } as const;
    const fgMap = {
        primary: p.accentOn,
        secondary: p.text,
        ghost: p.text,
        danger: '#ffffff',
        success: '#ffffff',
    } as const;
    const height = size === 'sm' ? 36 : size === 'lg' ? 52 : 44;

    return (
        <Pressable
            onPress={disabled || loading ? undefined : onPress}
            style={({ pressed }) => [
                {
                    height,
                    paddingHorizontal: theme.spacing.lg,
                    borderRadius: theme.radius.md,
                    backgroundColor: bgMap[variant],
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: theme.spacing.sm,
                    opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
                    alignSelf: fullWidth ? 'stretch' : 'flex-start',
                    borderWidth: variant === 'ghost' ? 1 : 0,
                    borderColor: variant === 'ghost' ? p.border : 'transparent',
                },
                style,
            ]}
        >
            {loading ? (
                <ActivityIndicator color={fgMap[variant]} size="small" />
            ) : (
                <Text
                    style={{
                        color: fgMap[variant],
                        fontSize: size === 'sm' ? 13 : 15,
                        fontWeight: '600',
                    }}
                >
                    {label}
                </Text>
            )}
        </Pressable>
    );
};

type CardProps = {
    children: React.ReactNode;
    title?: string;
    subtitle?: string;
    style?: ViewStyle;
    padded?: boolean;
    onPress?: () => void;
};

export const Card: React.FC<CardProps> = ({
    children,
    title,
    subtitle,
    style,
    padded = true,
    onPress,
}) => {
    const theme = useTheme();
    const content = (
        <View
            style={[
                {
                    backgroundColor: theme.palette.surface,
                    borderRadius: theme.radius.lg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.palette.border,
                    padding: padded ? theme.spacing.lg : 0,
                    gap: theme.spacing.sm,
                },
                style,
            ]}
        >
            {(title || subtitle) && (
                <View style={{ gap: 2, marginBottom: theme.spacing.xs }}>
                    {title ? <Txt variant="subheading">{title}</Txt> : null}
                    {subtitle ? <Txt variant="small" color="muted">{subtitle}</Txt> : null}
                </View>
            )}
            {children}
        </View>
    );
    if (onPress) {
        return (
            <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
                {content}
            </Pressable>
        );
    }
    return content;
};

type FieldProps = {
    label?: string;
    hint?: string;
    error?: string;
    children: React.ReactNode;
};

export const Field: React.FC<FieldProps> = ({ label, hint, error, children }) => {
    const theme = useTheme();
    return (
        <View style={{ gap: theme.spacing.xs }}>
            {label ? (
                <Txt variant="small" color="muted" weight="500">
                    {label}
                </Txt>
            ) : null}
            {children}
            {error ? (
                <Txt variant="small" color="error">{error}</Txt>
            ) : hint ? (
                <Txt variant="small" color="subtle">{hint}</Txt>
            ) : null}
        </View>
    );
};

export const Input: React.FC<TextInputProps> = (props) => {
    const theme = useTheme();
    return (
        <TextInput
            placeholderTextColor={theme.palette.textSubtle}
            style={[
                {
                    height: 44,
                    paddingHorizontal: theme.spacing.md,
                    borderRadius: theme.radius.md,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.palette.border,
                    backgroundColor: theme.palette.surface,
                    color: theme.palette.text,
                    fontSize: 15,
                },
                props.multiline
                    ? {
                          height: undefined,
                          minHeight: 88,
                          paddingVertical: 10,
                          textAlignVertical: 'top',
                      }
                    : null,
                props.style,
            ]}
            {...props}
        />
    );
};

type BannerProps = {
    tone?: 'info' | 'success' | 'error' | 'warning';
    children: React.ReactNode;
};

export const Banner: React.FC<BannerProps> = ({ tone = 'info', children }) => {
    const theme = useTheme();
    const p = theme.palette;
    const bgMap = {
        info: p.surfaceAlt,
        success: 'rgba(31, 138, 101, 0.12)',
        error: 'rgba(207, 45, 86, 0.12)',
        warning: 'rgba(192, 133, 50, 0.15)',
    } as const;
    const colorMap = {
        info: p.textMuted,
        success: p.success,
        error: p.error,
        warning: p.warning,
    } as const;
    return (
        <View
            style={{
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: bgMap[tone],
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colorMap[tone] + '55',
            }}
        >
            <Text style={{ color: colorMap[tone], fontSize: 14, lineHeight: 20 }}>{children}</Text>
        </View>
    );
};

type StatCardProps = {
    label: string;
    value: string | number;
    hint?: string;
    tone?: 'default' | 'accent' | 'success' | 'error' | 'warning';
    money?: boolean;
};

export const StatCard: React.FC<StatCardProps> = ({ label, value, hint, tone = 'default', money }) => {
    const theme = useTheme();
    const display = money ? formatMMK(Number(value)) : String(value);
    const toneColor =
        tone === 'accent' ? theme.palette.accent
        : tone === 'success' ? theme.palette.success
        : tone === 'error' ? theme.palette.error
        : tone === 'warning' ? theme.palette.warning
        : theme.palette.text;
    return (
        <Card style={{ flex: 1 }}>
            <Txt variant="micro" color="muted">{label}</Txt>
            <Text
                style={{
                    color: toneColor,
                    fontSize: 22,
                    fontWeight: '600',
                    letterSpacing: -0.4,
                }}
            >
                {display}
            </Text>
            {hint ? <Txt variant="small" color="subtle">{hint}</Txt> : null}
        </Card>
    );
};

type ChipProps = {
    label: string;
    tone?: 'default' | 'accent' | 'success' | 'error' | 'warning';
    onPress?: () => void;
    active?: boolean;
};

export const Chip: React.FC<ChipProps> = ({ label, tone = 'default', onPress, active }) => {
    const theme = useTheme();
    const p = theme.palette;
    const bg =
        active ? p.accent
        : tone === 'success' ? 'rgba(31, 138, 101, 0.15)'
        : tone === 'error' ? 'rgba(207, 45, 86, 0.15)'
        : tone === 'warning' ? 'rgba(192, 133, 50, 0.18)'
        : tone === 'accent' ? 'rgba(245, 78, 0, 0.15)'
        : p.surfaceAlt;
    const fg =
        active ? p.accentOn
        : tone === 'success' ? p.success
        : tone === 'error' ? p.error
        : tone === 'warning' ? p.warning
        : tone === 'accent' ? p.accent
        : p.textMuted;
    const Wrapper: any = onPress ? Pressable : View;
    return (
        <Wrapper
            onPress={onPress}
            style={{
                paddingHorizontal: theme.spacing.md,
                paddingVertical: 6,
                borderRadius: theme.radius.pill,
                backgroundColor: bg,
                alignSelf: 'flex-start',
            }}
        >
            <Text style={{ color: fg, fontSize: 12, fontWeight: '600', letterSpacing: 0.2 }}>
                {label}
            </Text>
        </Wrapper>
    );
};

export const KVRow: React.FC<{ label: string; value: React.ReactNode; last?: boolean }> = ({
    label,
    value,
    last,
}) => {
    const theme = useTheme();
    return (
        <View
            style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                paddingVertical: theme.spacing.sm,
                borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: theme.palette.border,
                gap: theme.spacing.md,
            }}
        >
            <Txt variant="small" color="muted">{label}</Txt>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
                {typeof value === 'string' || typeof value === 'number' ? (
                    <Txt variant="body" weight="500">{value}</Txt>
                ) : (
                    value
                )}
            </View>
        </View>
    );
};

export const Divider: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
    const theme = useTheme();
    return (
        <View
            style={
                vertical
                    ? {
                          width: StyleSheet.hairlineWidth,
                          alignSelf: 'stretch',
                          backgroundColor: theme.palette.border,
                      }
                    : {
                          height: StyleSheet.hairlineWidth,
                          alignSelf: 'stretch',
                          backgroundColor: theme.palette.border,
                      }
            }
        />
    );
};

export const Loading: React.FC<{ label?: string }> = ({ label }) => {
    const theme = useTheme();
    return (
        <View
            style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.md,
            }}
        >
            <ActivityIndicator color={theme.palette.accent} />
            {label ? <Txt variant="small" color="muted">{label}</Txt> : null}
        </View>
    );
};

export const EmptyState: React.FC<{
    title: string;
    hint?: string;
    action?: React.ReactNode;
}> = ({ title, hint, action }) => {
    const theme = useTheme();
    return (
        <View
            style={{
                padding: theme.spacing.xl,
                alignItems: 'center',
                gap: theme.spacing.sm,
            }}
        >
            <Txt variant="subheading" color="muted">{title}</Txt>
            {hint ? (
                <Txt variant="small" color="subtle" style={{ textAlign: 'center' }}>
                    {hint}
                </Txt>
            ) : null}
            {action}
        </View>
    );
};
