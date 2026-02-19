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
import { TOKEN_KEY, USER_KEY, LOCALE_STORAGE_KEY, VISITOR_KEY } from '@/lib/constants';

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
  visitorCode: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, display_name?: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
  initVisitor: () => Promise<void>;
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
  const [visitorCode, setVisitorCode] = useState<string | null>(() =>
    localStorage.getItem(VISITOR_KEY),
  );

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

  const initVisitor = useCallback(async () => {
    // Only init if no user and no visitor code yet
    if (localStorage.getItem(VISITOR_KEY)) return;
    try {
      const v = await api.createVisitor();
      localStorage.setItem(VISITOR_KEY, v.visitor_code);
      setVisitorCode(v.visitor_code);
    } catch {
      // non-critical: visitor may not be created if network is down
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      // Init visitor when no user token exists
      initVisitor();
      return;
    }
    refreshUser().finally(() => setLoading(false));
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const vc = localStorage.getItem(VISITOR_KEY);
    const { user: u, token: t } = await api.login({
      email,
      password,
      visitor_code: vc ?? undefined,
    } as any);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    // Clear visitor code after successful login (merged on server)
    localStorage.removeItem(VISITOR_KEY);
    setVisitorCode(null);
    setToken(t);
    setUserState(u);
  }, []);

  const register = useCallback(async (email: string, password: string, display_name?: string) => {
    const vc = localStorage.getItem(VISITOR_KEY);
    const { user: u, token: t } = await api.register({
      email,
      password,
      display_name,
      visitor_code: vc ?? undefined,
    } as any);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    // Clear visitor code after successful register (merged on server)
    localStorage.removeItem(VISITOR_KEY);
    setVisitorCode(null);
    setToken(t);
    setUserState(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUserState(null);
    // Re-init visitor after logout
    initVisitor();
  }, [initVisitor]);

  const authValue: AuthContextValue = useMemo(
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
      initVisitor,
    }),
    [user, token, loading, visitorCode, login, register, logout, setUser, refreshUser, initVisitor],
  );

  return <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// --- Theme ---
const THEME_STORAGE_KEY = 'theme';
type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme): boolean {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
  return dark;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {}
    return 'system';
  });
  const [isDark, setIsDark] = useState(() =>
    applyTheme(
      (() => {
        try {
          const s = localStorage.getItem(THEME_STORAGE_KEY);
          if (s === 'light' || s === 'dark' || s === 'system') return s as Theme;
        } catch {}
        return 'system';
      })(),
    ),
  );

  useEffect(() => {
    const dark = applyTheme(theme);
    setIsDark(dark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const dark = applyTheme('system');
      setIsDark(dark);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, isDark, setTheme }),
    [theme, isDark, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// --- I18n ---
interface I18nContextValue {
  locale: LocaleCode;
  setLocale: (lang: string) => Promise<void>;
  t: (key: string) => string;
  languages: { code: string; name: string }[];
  /** True once initial locale and translations have loaded (aligns with mobile `ready`). */
  ready: boolean;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

function resolveInitialLocale(list: { code: string; name: string }[]): LocaleCode {
  const codes = list.map((l) => l.code);
  const codeSet = new Set(codes);
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && codeSet.has(stored)) return stored as LocaleCode;
  } catch {}
  if (typeof navigator === 'undefined')
    return codes.includes('en') ? 'en' : (codes[0] as LocaleCode);
  const device = navigator.language?.toLowerCase().split(/[-_]/)[0] ?? 'en';
  const match = codes.find((c) => c === device || c.split(/[-_]/)[0] === device);
  return (match as LocaleCode) ?? (codes.includes('en') ? 'en' : (codes[0] as LocaleCode));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, visitorCode } = useAuth();
  const [locale, setLocaleState] = useState<LocaleCode>('en');
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
        const initial = resolveInitialLocale(list);
        setLocaleState(initial);
        await loadTranslations(initial);
        if (cancelled) return;
        setReady(true);
      } catch {
        if (!cancelled) {
          setLocaleState('en');
          await loadTranslations('en');
          if (!cancelled) setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLanguages, loadTranslations]);

  // Sync language from user settings when logged in
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const settings = await api.getSettings();
        if (settings.language && SUPPORTED_LOCALES.includes(settings.language as LocaleCode)) {
          const next = settings.language as LocaleCode;
          setLocaleState(next);
          localStorage.setItem(LOCALE_STORAGE_KEY, next);
          await loadTranslations(next);
        }
      } catch {
        // ignore
      }
    })();
  }, [user?.user_code, loadTranslations]);

  // Sync language from visitor settings when no user
  useEffect(() => {
    if (user || !visitorCode) return;
    (async () => {
      try {
        const settings = await api.getVisitorSettings(visitorCode);
        if (settings.language && SUPPORTED_LOCALES.includes(settings.language as LocaleCode)) {
          const next = settings.language as LocaleCode;
          if (next !== 'en') {
            setLocaleState(next);
            localStorage.setItem(LOCALE_STORAGE_KEY, next);
            await loadTranslations(next);
          }
        }
      } catch {
        // ignore
      }
    })();
  }, [visitorCode, user, loadTranslations]);

  const setLocale = useCallback(
    async (lang: string) => {
      const next = normalizeLocale(lang) as LocaleCode;
      setLocaleState(next);
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
      await loadTranslations(next);
      try {
        if (user) {
          await api.updateSettings({ language: next });
        } else {
          const vc = localStorage.getItem(VISITOR_KEY);
          if (vc) await api.updateVisitorSettings(vc, { language: next });
        }
      } catch {
        // not logged in or request failed
      }
    },
    [loadTranslations, user],
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
    () => ({ locale, setLocale, t, languages, ready }),
    [locale, setLocale, t, languages, ready],
  );

  return <I18nContext.Provider value={i18nValue}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
