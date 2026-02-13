import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { User } from '@/lib/types';
import * as api from '@/lib/api/client';
import { TOKEN_KEY, USER_KEY, LOCALE_STORAGE_KEY } from '@/lib/constants';

const SUPPORTED_LOCALES = ['en', 'ar', 'hi'] as const;
type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

function normalizeLocale(lang: string): LocaleCode {
  const lower = lang.toLowerCase().split(/[-_]/)[0];
  if (SUPPORTED_LOCALES.includes(lower as LocaleCode)) return lower as LocaleCode;
  return 'en';
}

// --- Auth ---
interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, display_name?: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(() => {
    try {
      const s = localStorage.getItem(USER_KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const u = await api.getMe();
      setUser(u);
    } catch {
      setToken(null);
      setUser(null);
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [token, setUser]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    refreshUser().finally(() => setLoading(false));
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u, token: t } = await api.login({ email, password });
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(t);
    setUserState(u);
  }, []);

  const register = useCallback(async (email: string, password: string, display_name?: string) => {
    const { user: u, token: t } = await api.register({ email, password, display_name });
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(t);
    setUserState(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUserState(null);
  }, []);

  const authValue: AuthContextValue = useMemo(
    () => ({ user, token, loading, login, register, logout, setUser, refreshUser }),
    [user, token, loading, login, register, logout, setUser, refreshUser],
  );

  return <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// --- I18n ---
interface I18nContextValue {
  locale: LocaleCode;
  setLocale: (lang: string) => Promise<void>;
  t: (key: string) => string;
  languages: { code: string; name: string }[];
  loading: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && SUPPORTED_LOCALES.includes(stored as LocaleCode)) return stored as LocaleCode;
    } catch {}
    return normalizeLocale(typeof navigator !== 'undefined' ? navigator.language : 'en');
  });
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [languages, setLanguages] = useState<{ code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLanguages = useCallback(async () => {
    try {
      const list = await api.getLanguages();
      setLanguages(list);
    } catch {
      setLanguages([{ code: 'en', name: 'English' }, { code: 'ar', name: 'العربية' }, { code: 'hi', name: 'हिन्दी' }]);
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
    loadLanguages().finally(() => setLoading(false));
  }, [loadLanguages]);

  useEffect(() => {
    loadTranslations(locale);
  }, [locale, loadTranslations]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const settings = await api.getSettings();
        if (settings.language && SUPPORTED_LOCALES.includes(settings.language as LocaleCode)) {
          setLocaleState(settings.language as LocaleCode);
          localStorage.setItem(LOCALE_STORAGE_KEY, settings.language);
        }
      } catch {
        // ignore
      }
    })();
  }, [user?.user_code]);

  const setLocale = useCallback(
    async (lang: string) => {
      const next = normalizeLocale(lang) as LocaleCode;
      setLocaleState(next);
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
      await loadTranslations(next);
      try {
        await api.updateSettings({ language: next });
      } catch {
        // not logged in or request failed
      }
    },
    [loadTranslations],
  );

  useEffect(() => {
    const root = document.documentElement;
    if (locale === 'ar') {
      root.setAttribute('dir', 'rtl');
      root.setAttribute('lang', 'ar');
    } else {
      root.setAttribute('dir', 'ltr');
      root.setAttribute('lang', locale);
    }
  }, [locale]);

  const t = useCallback((key: string) => translations[key] ?? key, [translations]);

  const i18nValue = useMemo(
    () => ({ locale, setLocale, t, languages, loading }),
    [locale, setLocale, t, languages, loading],
  );

  return <I18nContext.Provider value={i18nValue}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
