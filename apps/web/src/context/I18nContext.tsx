import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { getLanguages, getTranslations, updateSettings } from '@/api/client';
import type { LanguageOption } from '@/api/client';
import { useAuth } from '@/context/AuthContext';

const LOCALE_STORAGE_KEY = 'pilgrimage-locale';
const SUPPORTED = ['en', 'ar', 'hi'] as const;
type LocaleCode = (typeof SUPPORTED)[number];

function normalizeLocale(lang: string): LocaleCode {
  const lower = lang.toLowerCase().split(/[-_]/)[0];
  if (SUPPORTED.includes(lower as LocaleCode)) return lower as LocaleCode;
  return 'en';
}

interface I18nContextValue {
  locale: LocaleCode;
  setLocale: (lang: string) => Promise<void>;
  t: (key: string) => string;
  languages: LanguageOption[];
  loading: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && SUPPORTED.includes(stored as LocaleCode)) return stored as LocaleCode;
    } catch {}
    return normalizeLocale(typeof navigator !== 'undefined' ? navigator.language : 'en');
  });
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLanguages = useCallback(async () => {
    try {
      const list = await getLanguages();
      setLanguages(list);
    } catch {
      setLanguages([{ code: 'en', name: 'English' }, { code: 'ar', name: 'العربية' }, { code: 'hi', name: 'हिन्दी' }]);
    }
  }, []);

  const loadTranslations = useCallback(async (lang: string) => {
    try {
      const map = await getTranslations(lang);
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

  // When user logs in, optionally sync locale from server settings (without overwriting if user already chose one)
  useEffect(() => {
    if (!user) return;
    getSettingsLanguage();
    async function getSettingsLanguage() {
      try {
        const { getSettings } = await import('@/api/client');
        const settings = await getSettings();
        if (settings.language && SUPPORTED.includes(settings.language as LocaleCode)) {
          setLocaleState(settings.language as LocaleCode);
          localStorage.setItem(LOCALE_STORAGE_KEY, settings.language);
        }
      } catch {
        // ignore
      }
    }
  }, [user?.user_code]);

  const setLocale = useCallback(
    async (lang: string) => {
      const next = normalizeLocale(lang) as LocaleCode;
      setLocaleState(next);
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
      await loadTranslations(next);
      try {
        await updateSettings({ language: next });
      } catch {
        // not logged in or request failed; locale still updated locally
      }
    },
    [loadTranslations],
  );

  // RTL for Arabic
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

  const t = useCallback(
    (key: string) => {
      return translations[key] ?? key;
    },
    [translations],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, languages, loading }),
    [locale, setLocale, t, languages, loading],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
