import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../lib/types';
import * as api from '../lib/api/client';
import {
  TOKEN_KEY,
  USER_KEY,
  LOCALE_STORAGE_KEY,
} from '../lib/constants';
import { getStoredTheme, setStoredTheme, type Theme } from '../lib/theme';

const SUPPORTED_LOCALES = ['en', 'ar', 'hi'] as const;
type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

function normalizeLocale(lang: string): LocaleCode {
  const lower = lang.toLowerCase().split(/[-_]/)[0];
  if (SUPPORTED_LOCALES.includes(lower as LocaleCode)) return lower as LocaleCode;
  return 'en';
}

// --- Auth ---
interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
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
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u, token: t } = await api.login({ email, password });
    await AsyncStorage.multiSet([
      [TOKEN_KEY, t],
      [USER_KEY, JSON.stringify(u)],
    ]);
    setToken(t);
    setUserState(u);
  }, []);

  const register = useCallback(
    async (email: string, password: string, display_name?: string) => {
      const { user: u, token: t } = await api.register({
        email,
        password,
        display_name,
      });
      await AsyncStorage.multiSet([
        [TOKEN_KEY, t],
        [USER_KEY, JSON.stringify(u)],
      ]);
      setToken(t);
      setUserState(u);
    },
    []
  );

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setToken(null);
    setUserState(null);
  }, []);

  const authValue = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      login,
      register,
      logout,
      setUser,
      refreshUser,
    }),
    [user, token, loading, login, register, logout, setUser, refreshUser]
  );

  return (
    <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// --- Theme ---
interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');

  useEffect(() => {
    let cancelled = false;
    getStoredTheme().then((t) => {
      if (!cancelled) setThemeState(t);
    });
    return () => { cancelled = true; };
  }, []);

  const setTheme = useCallback(async (t: Theme) => {
    setThemeState(t);
    await setStoredTheme(t);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme }),
    [theme, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
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
  const [languages, setLanguages] = useState<{ code: string; name: string }[]>(
    []
  );
  const [ready, setReady] = useState(false);

  const loadLanguages = useCallback(async () => {
    try {
      const list = await api.getLanguages();
      setLanguages(list);
    } catch {
      setLanguages([
        { code: 'en', name: 'English' },
        { code: 'ar', name: 'العربية' },
        { code: 'hi', name: 'हिन्दी' },
      ]);
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
        const stored = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
        const initial = stored && SUPPORTED_LOCALES.includes(stored as LocaleCode)
          ? stored
          : 'en';
        setLocaleState(initial);
        await loadLanguages();
        if (!cancelled) await loadTranslations(initial);
        const isRTL = initial === 'ar';
        if (I18nManager.isRTL !== isRTL) {
          I18nManager.forceRTL(isRTL);
        }
      } catch {
        setLocaleState('en');
        await loadLanguages();
        if (!cancelled) await loadTranslations('en');
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
      } catch {
        // keep new locale
      }
    },
    [loadTranslations]
  );

  const t = useCallback(
    (key: string) => translations[key] ?? key,
    [translations]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, languages, ready }),
    [locale, setLocale, t, languages, ready]
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
