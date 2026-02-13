import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/app/providers';
import { getSettings, updateSettings } from '@/lib/api/client';
import { applyTheme, getStoredTheme, type Theme } from '@/lib/theme';
import type { UserSettings } from '@/lib/types';

const THEME_OPTIONS: { value: Theme; labelKey: string }[] = [
  { value: 'light', labelKey: 'settings.themeLight' },
  { value: 'dark', labelKey: 'settings.themeDark' },
  { value: 'system', labelKey: 'settings.themeSystem' },
];

export default function Settings() {
  const { t, locale, setLocale, languages } = useI18n();
  const [theme, setThemeState] = useState<Theme>(getStoredTheme());
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await getSettings();
      setSettings(s);
      if (s.theme && (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system')) {
        setThemeState(s.theme as Theme);
        applyTheme(s.theme as Theme);
      }
    } catch (e) {
      setSettings({});
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleThemeChange = (value: Theme) => {
    setThemeState(value);
    applyTheme(value);
    setSaving(true);
    updateSettings({ theme: value })
      .then(() => setSettings((s) => (s ? { ...s, theme: value } : { theme: value })))
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  const handleLanguageChange = async (code: string) => {
    setSaving(true);
    try {
      await setLocale(code);
      await updateSettings({ language: code });
      setSettings((s) => (s ? { ...s, language: code } : { language: code }));
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationsToggle = (on: boolean) => {
    setSaving(true);
    updateSettings({ notifications_on: on })
      .then((s) => setSettings(s))
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6 pb-24 md:pb-6">
      <header className="mb-6">
        <p className="text-sm text-primary font-medium uppercase tracking-wide mb-1">Preferences</p>
        <h1 className="text-2xl font-semibold text-text-main">{t('settings.title')}</h1>
      </header>

      {loading && !error && <p className="text-text-muted text-sm">{t('common.loading')}</p>}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4">
          <p className="text-red-700 dark:text-red-300 text-sm mb-2">{error}</p>
          <button
            type="button"
            onClick={fetchSettings}
            className="text-primary font-medium text-sm hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
          >
            {t('common.retry')}
          </button>
        </div>
      )}
      {!loading && (
        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">{t('settings.appearance')}</h2>
            <div className="rounded-xl border border-input-border bg-white dark:bg-gray-800 overflow-hidden divide-y divide-input-border">
              <div className="p-4">
                <p className="text-sm font-medium text-text-main mb-2">{t('settings.theme')}</p>
                <div className="flex gap-2 flex-wrap">
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleThemeChange(opt.value)}
                      disabled={saving}
                      aria-pressed={theme === opt.value}
                      aria-label={t(opt.labelKey)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        theme === opt.value
                          ? 'bg-primary text-white border-primary'
                          : 'border-input-border text-text-muted hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm font-medium text-text-main mb-2">{t('settings.language')}</p>
                <select
                  value={locale}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  disabled={saving}
                  className="w-full border border-input-border rounded-lg px-4 py-2 text-text-main bg-background-light dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {languages.length > 0 ? (
                    languages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="en">English</option>
                      <option value="ar">العربية</option>
                      <option value="hi">हिन्दी</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">{t('settings.preferences')}</h2>
            <div className="rounded-xl border border-input-border bg-white dark:bg-gray-800 overflow-hidden divide-y divide-input-border">
              <label className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <span className="text-text-main font-medium">{t('settings.notifications')}</span>
                <input
                  type="checkbox"
                  checked={settings?.notifications_on ?? true}
                  onChange={(e) => handleNotificationsToggle(e.target.checked)}
                  disabled={saving}
                  className="rounded border-gray-300 text-primary"
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">Support</h2>
            <div className="rounded-xl border border-input-border bg-white dark:bg-gray-800 overflow-hidden divide-y divide-input-border">
              <a
                href="#about"
                className="flex items-center justify-between p-4 text-text-main hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <span>{t('settings.about')}</span>
                <span className="material-symbols-outlined text-text-muted text-lg">chevron_right</span>
              </a>
              <a
                href="#terms"
                className="flex items-center justify-between p-4 text-text-main hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <span>{t('settings.termsOfService')}</span>
                <span className="material-symbols-outlined text-text-muted text-lg">chevron_right</span>
              </a>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">Account</h2>
            <div className="rounded-xl border border-input-border bg-white dark:bg-gray-800 overflow-hidden">
              {!deleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(true)}
                  className="w-full flex items-center justify-between p-4 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <span className="font-medium">Delete account</span>
                  <span className="material-symbols-outlined text-lg">chevron_right</span>
                </button>
              ) : (
                <div className="p-4 space-y-3">
                  <p className="text-sm text-text-muted">
                    Delete your account and all data? This cannot be undone. If this is not implemented on the backend, contact support.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(false)}
                      className="flex-1 py-2 rounded-lg border border-input-border text-text-main font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteConfirm(false);
                        // Backend delete not implemented; show message
                        alert('Account deletion is not available. Please contact support.');
                      }}
                      className="flex-1 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
