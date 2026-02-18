import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { Appearance, I18nManager, NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@/lib/types';
import * as api from '@/lib/api/client';
import { TOKEN_KEY, USER_KEY, LOCALE_STORAGE_KEY, VISITOR_KEY } from '@/lib/constants';
import { getStoredTheme, setStoredTheme, type Theme } from '@/lib/theme';

const SUPPORTED_LOCALES = ['en', 'ar', 'hi'] as const;
type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

function normalizeLocale(lang: string): LocaleCode {
  const lower = lang.toLowerCase().split(/[-_]/)[0];
  if (SUPPORTED_LOCALES.includes(lower as LocaleCode)) return lower as LocaleCode;
  return 'en';
}

function getDeviceLocale(): string {
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      const raw = settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
      return typeof raw === 'string' ? raw : 'en';
    }
    if (Platform.OS === 'android') {
      const raw = NativeModules.I18nManager?.localeIdentifier;
      return typeof raw === 'string' ? raw : 'en';
    }
  } catch {}
  return 'en';
}

async function resolveInitialLocale(list: { code: string; name: string }[]): Promise<string> {
  const codes = list.map((l) => l.code);
  const codeSet = new Set(codes);
  try {
    const stored = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && codeSet.has(stored)) return stored;
  } catch {}
  const device = getDeviceLocale().toLowerCase().split(/[-_]/)[0] ?? 'en';
  const match = codes.find((c) => c === device || c.split(/[-_]/)[0] === device);
  return match ?? (codes.includes('en') ? 'en' : (codes[0] ?? 'en'));
}

// --- Auth ---
interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  visitorCode: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, display_name?: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visitorCode, setVisitorCode] = useState<string | null>(null);

  const initVisitor = useCallback(async () => {
    try {
      let code = await AsyncStorage.getItem(VISITOR_KEY);
      if (!code) {
        const v = await api.createVisitor();
        code = v.visitor_code;
        await AsyncStorage.setItem(VISITOR_KEY, code);
      }
      setVisitorCode(code);
    } catch {
      // visitor init is non-fatal
    }
  }, []);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    if (u) AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
    else AsyncStorage.removeItem(USER_KEY);
  }, []);

  const refreshUser = useCallback(async () => {
    const t = await AsyncStorage.getItem(TOKEN_KEY);
    if (!t) return;
    try {
      const u = await api.getMe();
      setUserState(u);
      AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
    } catch {
      setToken(null);
      setUserState(null);
      await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await AsyncStorage.getItem(TOKEN_KEY);
      if (cancelled) return;
      if (!t) {
        setToken(null);
        setUserState(null);
        setLoading(false);
        await initVisitor();
        return;
      }
      setToken(t);
      try {
        const u = await api.getMe();
        if (!cancelled) {
          setUserState(u);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
        }
      } catch {
        if (!cancelled) {
          setToken(null);
          setUserState(null);
          await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
          await initVisitor();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initVisitor]);

  const login = useCallback(async (email: string, password: string) => {
    const vc = await AsyncStorage.getItem(VISITOR_KEY);
    const { user: u, token: t } = await api.login({
      email,
      password,
      visitor_code: vc ?? undefined,
    });
    await AsyncStorage.multiSet([
      [TOKEN_KEY, t],
      [USER_KEY, JSON.stringify(u)],
    ]);
    await AsyncStorage.removeItem(VISITOR_KEY);
    setVisitorCode(null);
    setToken(t);
    setUserState(u);
  }, []);

  const register = useCallback(async (email: string, password: string, display_name?: string) => {
    const vc = await AsyncStorage.getItem(VISITOR_KEY);
    const { user: u, token: t } = await api.register({
      email,
      password,
      display_name,
      visitor_code: vc ?? undefined,
    });
    await AsyncStorage.multiSet([
      [TOKEN_KEY, t],
      [USER_KEY, JSON.stringify(u)],
    ]);
    await AsyncStorage.removeItem(VISITOR_KEY);
    setVisitorCode(null);
    setToken(t);
    setUserState(u);
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setToken(null);
    setUserState(null);
    await initVisitor();
  }, [initVisitor]);

  const authValue = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      visitorCode,
      login,
      register,
      logout,
      setUser,
      refreshUser,
    }),
    [user, token, loading, visitorCode, login, register, logout, setUser, refreshUser],
  );

  return <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// --- Theme ---
interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  setTheme: (t: Theme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveIsDark(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return Appearance.getColorScheme() === 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [isDark, setIsDark] = useState(() => resolveIsDark('system'));

  useEffect(() => {
    let cancelled = false;
    getStoredTheme().then((t) => {
      if (!cancelled) {
        setThemeState(t);
        setIsDark(resolveIsDark(t));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setIsDark(colorScheme === 'dark');
    });
    return () => sub.remove();
  }, [theme]);

  const setTheme = useCallback(async (t: Theme) => {
    setThemeState(t);
    setIsDark(resolveIsDark(t));
    await setStoredTheme(t);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, isDark, setTheme }),
    [theme, isDark, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// --- I18n ---
interface I18nContextValue {
  locale: string;
  setLocale: (lang: string) => Promise<void>;
  t: (key: string) => string;
  languages: { code: string; name: string }[];
  ready: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<string>('en');
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [languages, setLanguages] = useState<{ code: string; name: string }[]>([]);
  const [ready, setReady] = useState(false);

  const loadLanguages = useCallback(async () => {
    try {
      const list = await api.getLanguages();
      setLanguages(list);
      return list;
    } catch {
      const fallback = [
        { code: 'en', name: 'English' },
        { code: 'ar', name: 'العربية' },
        { code: 'hi', name: 'हिन्दी' },
      ];
      setLanguages(fallback);
      return fallback;
    }
  }, []);

  const loadTranslations = useCallback(async (lang: string) => {
    try {
      const map = await api.getTranslations(lang);
      setTranslations(map);
    } catch {
      setTranslations({});
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await loadLanguages();
        if (cancelled) return;
        const initial = await resolveInitialLocale(list);
        if (cancelled) return;
        setLocaleState(initial);
        await loadTranslations(initial);
        if (cancelled) return;
        const isRTL = initial === 'ar';
        if (I18nManager.isRTL !== isRTL) {
          I18nManager.forceRTL(isRTL);
        }
      } catch {
        if (!cancelled) {
          setLocaleState('en');
          await loadLanguages();
          if (!cancelled) await loadTranslations('en');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLanguages, loadTranslations]);

  const setLocale = useCallback(
    async (lang: string) => {
      const next = normalizeLocale(lang);
      setLocaleState(next);
      try {
        await AsyncStorage.setItem(LOCALE_STORAGE_KEY, next);
        await loadTranslations(next);
        const isRTL = next === 'ar';
        if (I18nManager.isRTL !== isRTL) {
          I18nManager.forceRTL(isRTL);
        }
        const vc = await AsyncStorage.getItem(VISITOR_KEY);
        if (vc) {
          api.updateVisitorSettings(vc, { language: next }).catch(() => {});
        } else {
          api.updateSettings({ language: next }).catch(() => {});
        }
      } catch {
        // keep new locale
      }
    },
    [loadTranslations],
  );

  const t = useCallback((key: string) => translations[key] ?? key, [translations]);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, languages, ready }),
    [locale, setLocale, t, languages, ready],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
