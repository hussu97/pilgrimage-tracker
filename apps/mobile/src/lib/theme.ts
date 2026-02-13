/**
 * Design tokens from DESIGN_FILE_V2.html.
 * Use for StyleSheet and component styling so web and mobile stay aligned.
 */
export const tokens = {
  colors: {
    primary: '#3b82f6',
    primaryDark: '#2563eb',
    accent: '#90CAF9',
    backgroundLight: '#f8fafc',
    surface: '#ffffff',
    softBlue: '#F0F5FA',
    surfaceTint: '#F0F7FF',
    textMain: '#0f172a',
    textDark: '#1e293b',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
    inputBorder: '#e2e8f0',
    blueTint: '#f0f9ff',
    iconGrey: '#475569',
    openNow: '#059669',
    openNowBg: 'rgba(16, 185, 129, 0.2)',
  },
  borderRadius: {
    sm: 4,
    default: 6,
    lg: 8,
    xl: 12,
    '2xl': 16,
    '3xl': 24,
    full: 9999,
  },
  shadow: {
    subtle: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 },
    card: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
    elevated: { shadowColor: '#94a3b8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 4 },
  },
  typography: {
    fontFamily: 'System', // Inter on web; RN uses system. Use font family from DESIGN_FILE when custom font is loaded.
    weights: { light: '300' as const, normal: '400' as const, medium: '500' as const, semibold: '600' as const, bold: '700' as const },
  },
} as const;
