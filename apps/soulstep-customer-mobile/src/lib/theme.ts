import { Platform } from 'react-native';
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
 * Design tokens from V3 design files.
 * Border radius values aligned with design reference:
 *   xl  = 12px  – inputs, inner elements
 *   2xl = 16px  – cards
 *   3xl = 24px  – large panels, bottom sheets
 *   4xl = 32px  – hero sections
 * Use for StyleSheet and component styling so web and mobile stay aligned.
 */
export const tokens = {
  colors: {
    primary: '#B0563D',
    primaryDark: '#8E4433',
    accent: '#D4A08C',
    backgroundLight: '#F5F0E9',
    surface: '#ffffff',
    softBlue: '#F2E8E4',
    surfaceTint: '#EADEC8',
    textMain: '#2D3E3B',
    textDark: '#2D3E3B',
    textSecondary: '#6B7280',
    textMuted: '#A39C94',
    inputBorder: '#D1C7BD',
    blueTint: '#FAF6F0',
    iconGrey: '#4A5D59',
    openNow: '#16a34a', // green for open
    openNowBg: 'rgba(22, 163, 74, 0.15)',
    closedNow: '#EF4444', // red for closed
    closedNowBg: 'rgba(239, 68, 68, 0.15)',
    unknownStatus: '#94a3b8', // grey for unknown
    unknownStatusBg: 'rgba(148, 163, 184, 0.15)',
    // Dark mode tokens
    darkBg: '#1A1A1A',
    darkSurface: '#242424',
    darkBorder: '#333333',
    darkTextSecondary: '#C4BDB5',
    // Primary with opacity (for partial check-in indicators, chips)
    primaryAlpha: 'rgba(176,86,61,0.15)',
    primaryAlphaDark: 'rgba(176,86,61,0.2)',
    // Leaderboard rank colors (gold / silver / bronze)
    goldRank: '#f59e0b',
    goldRankLight: '#fef3c7',
    goldRankDark: 'rgba(217,119,6,0.25)',
    goldRankNum: '#d97706',
    bronzeRank: '#f97316',
    bronzeRankLight: '#fff7ed',
    bronzeRankDark: 'rgba(234,88,12,0.15)',
    silverLight: '#f1f5f9',
    // Form error colors
    error: '#dc2626',
    errorDark: '#b91c1c',
    // Navigation / icon colors
    navIconLight: '#334155',
    // Activity indicator
    activityGreen: '#22c55e',
    activityGreenGlow: 'rgba(34, 197, 94, 0.6)',
  },
  borderRadius: {
    sm: 4,
    default: 6,
    lg: 8,
    xl: 12, // inputs, inner elements
    '2xl': 16, // cards (aligned with design reference)
    '3xl': 24, // large panels, bottom sheets
    '4xl': 32, // hero sections
    full: 9999,
  },
  shadow: {
    subtle: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 2,
      elevation: 1,
    },
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    cardMd: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    },
    elevated: {
      shadowColor: '#94a3b8',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 24,
      elevation: 4,
    },
    glass: {
      shadowColor: '#1F268F',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.07,
      shadowRadius: 32,
      elevation: 3,
    },
  },
  typography: {
    fontFamily: Platform.OS === 'web' ? 'Inter, system-ui, sans-serif' : 'System', // Inter on web; RN uses system.
    weights: {
      light: '300' as const,
      normal: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },
  },
} as const;
