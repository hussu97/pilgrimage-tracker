import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLanguages, getTranslations } from '../api/client';

const LOCALE_KEY = 'pilgrimage-locale';
const SUPPORTED = ['en', 'ar', 'hi'];

function normalizeLocale(lang) {
  if (!lang || typeof lang !== 'string') return 'en';
  const lower = lang.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.includes(lower) ? lower : 'en';
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState('en');
  const [translations, setTranslations] = useState({});
  const [languages, setLanguages] = useState([]);
  const [ready, setReady] = useState(false);

  const loadLanguages = useCallback(async () => {
    try {
      const list = await getLanguages();
      setLanguages(list);
    } catch {
      setLanguages([{ code: 'en', name: 'English' }, { code: 'ar', name: 'العربية' }, { code: 'hi', name: 'हिन्दी' }]);
    }
  }, []);

  const loadTranslations = useCallback(async (lang) => {
    try {
      const map = await getTranslations(lang);
      setTranslations(map);
    } catch {
      setTranslations({});
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LOCALE_KEY);
        const initial = stored && SUPPORTED.includes(stored) ? stored : 'en';
        setLocaleState(initial);
        await loadLanguages();
        if (!cancelled) await loadTranslations(initial);
        const isRTL = initial === 'ar';
        if (I18nManager.isRTL !== isRTL) I18nManager.forceRTL(isRTL);
      } catch {
        setLocaleState('en');
        await loadLanguages();
        if (!cancelled) await loadTranslations('en');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [loadLanguages, loadTranslations]);

  const setLocale = useCallback(async (lang) => {
    const next = normalizeLocale(lang);
    setLocaleState(next);
    await AsyncStorage.setItem(LOCALE_KEY, next);
    await loadTranslations(next);
    const isRTL = next === 'ar';
    if (I18nManager.isRTL !== isRTL) I18nManager.forceRTL(isRTL);
  }, [loadTranslations]);

  const t = useCallback((key) => translations[key] ?? key, [translations]);

  const value = useMemo(() => ({ locale, setLocale, t, languages, ready }), [locale, setLocale, t, languages, ready]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
