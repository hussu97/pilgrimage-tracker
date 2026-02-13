import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { getSettings, updateSettings } from '@/api/client';
import type { UserSettings } from '@/types';

const THEME_KEY = 'pilgrimage-theme';

export default function Settings() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale, languages } = useI18n();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettings>({});
  const [_loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const stored = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | 'system' | null;
    return stored || 'system';
  });

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    if (theme === 'system') {
      const q = window.matchMedia('(prefers-color-scheme: dark)');
      document.documentElement.classList.add(q.matches ? 'dark' : 'light');
    } else {
      document.documentElement.classList.add(theme);
    }
    localStorage.setItem(THEME_KEY, theme);
    updateSettings({ theme }).catch(() => {});
  }, [theme]);

  const handleLanguageChange = (lang: string) => {
    setLocale(lang);
  };

  if (!user) return null;

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      <h1 className="text-xl font-bold text-text-main mb-6">{t('settings.title')}</h1>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-text-main mb-3">{t('settings.appearance')}</h2>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <label className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 cursor-pointer">
            <span className="text-text-main">{t('settings.theme')}</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
              className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-text-main"
            >
              <option value="light">{t('settings.themeLight')}</option>
              <option value="dark">{t('settings.themeDark')}</option>
              <option value="system">{t('settings.themeSystem')}</option>
            </select>
          </label>
          <label className="flex items-center justify-between p-4 cursor-pointer">
            <span className="text-text-main">{t('settings.language')}</span>
            <select
              value={locale}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-text-main"
            >
              {languages.map((opt) => (
                <option key={opt.code} value={opt.code}>{opt.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-text-main mb-3">{t('settings.preferences')}</h2>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <label className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
            <span className="text-text-main">{t('settings.notifications')}</span>
            <input
              type="checkbox"
              checked={settings.notifications_on !== false}
              onChange={(e) => {
                const v = e.target.checked;
                setSettings((s) => ({ ...s, notifications_on: v }));
                updateSettings({ notifications_on: v }).catch(() => {});
              }}
              className="rounded"
            />
          </label>
          <label className="flex items-center justify-between p-4">
            <span className="text-text-main">{t('settings.units')}</span>
            <select
              value={settings.units || 'km'}
              onChange={(e) => {
                const v = e.target.value;
                setSettings((s) => ({ ...s, units: v }));
                updateSettings({ units: v }).catch(() => {});
              }}
              className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-text-main"
            >
              <option value="km">{t('settings.unitsKm')}</option>
              <option value="miles">{t('settings.unitsMiles')}</option>
            </select>
          </label>
        </div>
      </section>

      <section className="mb-6">
        <Link to="/notifications" className="block p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:shadow-sm">
          <span className="font-medium text-text-main">{t('nav.notifications')}</span>
          <span className="material-icons float-right text-gray-400">chevron_right</span>
        </Link>
      </section>

      <section className="mb-6">
        <a href="#" className="block p-4 text-text-muted text-sm">{t('settings.about')}</a>
        <a href="#" className="block p-4 text-text-muted text-sm">{t('settings.termsOfService')}</a>
      </section>

      <button
        type="button"
        onClick={() => { if (window.confirm(t('auth.logoutConfirm'))) { logout(); navigate('/'); } }}
        className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-medium"
      >
        {t('auth.logout')}
      </button>
    </div>
  );
}
