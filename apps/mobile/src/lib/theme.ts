import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEME_STORAGE_KEY } from './constants';

export type Theme = 'light' | 'dark' | 'system';

export async function getStoredTheme(): Promise<Theme> {
  try {
    const s = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    if (s === 'light' || s === 'dark' || s === 'system') return s;
  } catch {}
  return 'system';
}

export async function setStoredTheme(theme: Theme): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
}

/**
 * Design tokens from FRONTEND_REWAMP design files.
 * Use for StyleSheet and component styling so web and mobile stay aligned.
 */
export const tokens = {
  colors: {
    primary: '#007AFF',
    primaryDark: '#0062CC',
    accent: '#90CAF9',
    backgroundLight: '#f8fafc',
    surface: '#ffffff',
    softBlue: '#EBF5FF',
    surfaceTint: '#EBF5FF',
    textMain: '#0f172a',
    textDark: '#1e293b',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
    inputBorder: '#e2e8f0',
    blueTint: '#f0f9ff',
    iconGrey: '#475569',
    openNow: '#059669',
    openNowBg: 'rgba(16, 185, 129, 0.2)',
    // Dark mode tokens
    darkBg: '#121212',
    darkSurface: '#1E1E1E',
    darkBorder: '#2C2C2E',
    darkTextSecondary: '#A1A1A1',
  },
  borderRadius: {
    sm: 4,
    default: 6,
    lg: 8,
    xl: 12,
    '2xl': 24,
    '3xl': 32,
    '4xl': 40,
    full: 9999,
  },
  shadow: {
    subtle: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 },
    card: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
    elevated: { shadowColor: '#94a3b8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 4 },
    glass: { shadowColor: '#1F268F', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 32, elevation: 3 },
  },
  typography: {
    fontFamily: 'System', // Inter on web; RN uses system.
    weights: { light: '300' as const, normal: '400' as const, medium: '500' as const, semibold: '600' as const, bold: '700' as const },
  },
} as const;
