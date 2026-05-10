import { Platform } from 'react-native';

type Palette = {
    bg: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textSubtle: string;
    accent: string;
    accentOn: string;
    success: string;
    error: string;
    warning: string;
    gold: string;
};

export const lightPalette: Palette = {
    bg: '#f2f1ed',
    surface: '#ffffff',
    surfaceAlt: '#ebeae5',
    border: 'rgba(38, 37, 30, 0.12)',
    borderStrong: 'rgba(38, 37, 30, 0.4)',
    text: '#26251e',
    textMuted: 'rgba(38, 37, 30, 0.72)',
    textSubtle: 'rgba(38, 37, 30, 0.5)',
    accent: '#f54e00',
    accentOn: '#ffffff',
    success: '#1f8a65',
    error: '#cf2d56',
    warning: '#c08532',
    gold: '#c08532',
};

export const darkPalette: Palette = {
    bg: '#1a1915',
    surface: '#26251e',
    surfaceAlt: '#2f2e26',
    border: 'rgba(242, 241, 237, 0.12)',
    borderStrong: 'rgba(242, 241, 237, 0.35)',
    text: '#f2f1ed',
    textMuted: 'rgba(242, 241, 237, 0.72)',
    textSubtle: 'rgba(242, 241, 237, 0.5)',
    accent: '#f54e00',
    accentOn: '#ffffff',
    success: '#3ba97f',
    error: '#e85477',
    warning: '#d9a04a',
    gold: '#d9a04a',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 };

export const typography = {
    title: { fontSize: 24, fontWeight: '600' as const, letterSpacing: -0.4 },
    heading: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.3 },
    subheading: { fontSize: 17, fontWeight: '600' as const },
    body: { fontSize: 15, fontWeight: '400' as const },
    small: { fontSize: 13, fontWeight: '400' as const },
    micro: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.4 },
    mono: {
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
        fontSize: 13,
    },
};

export type Theme = {
    palette: Palette;
    spacing: typeof spacing;
    radius: typeof radius;
    typography: typeof typography;
    isDark: boolean;
};

export const makeTheme = (isDark: boolean): Theme => ({
    palette: isDark ? darkPalette : lightPalette,
    spacing,
    radius,
    typography,
    isDark,
});
