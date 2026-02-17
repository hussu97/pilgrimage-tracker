import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { getSettings, updateSettings } from '@/lib/api/client';
import { applyTheme, getStoredTheme, type Theme } from '@/lib/theme';
import type { UserSettings } from '@/lib/types';

const THEME_OPTIONS: { value: Theme; labelKey: string; icon: string }[] = [
  { value: 'light', labelKey: 'settings.themeLight', icon: 'light_mode' },
  { value: 'dark', labelKey: 'settings.themeDark', icon: 'dark_mode' },
  { value: 'system', labelKey: 'settings.themeSystem', icon: 'brightness_auto' },
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
    <div className="min-h-screen bg-background-light dark:bg-dark-bg">
      <div className="max-w-md mx-auto px-4 py-6 pb-24 md:pb-6">
        {/* Back link */}
        <header className="mb-6 flex items-center gap-3">
          <Link
            to="/profile"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-text-secondary dark:text-dark-text-secondary hover:bg-slate-50 dark:hover:bg-dark-border/50 transition-colors"
            aria-label={t('common.back')}
          >
            <span className="material-icons text-xl">arrow_back</span>
          </Link>
          <div>
            <p className="text-xs text-primary font-semibold uppercase tracking-wide">{t('settings.preferences')}</p>
            <h1 className="text-2xl font-bold text-text-main dark:text-white">{t('settings.title')}</h1>
          </div>
        </header>

        {loading && !error && (
          <p className="text-text-muted dark:text-dark-text-secondary text-sm">{t('common.loading')}</p>
        )}
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
            {/* Appearance */}
            <section>
              <h2 className="text-[11px] font-bold text-text-muted dark:text-dark-text-secondary uppercase tracking-[0.2em] mb-3 ml-2">
                {t('settings.appearance')}
              </h2>
              <div className="bg-white dark:bg-dark-surface rounded-2xl border border-input-border dark:border-dark-border overflow-hidden divide-y divide-slate-50 dark:divide-dark-border">
                {/* Theme */}
                <div className="p-4">
                  <p className="text-sm font-semibold text-text-main dark:text-white mb-3">{t('settings.theme')}</p>
                  <div className="flex gap-2">
                    {THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleThemeChange(opt.value)}
                        disabled={saving}
                        aria-pressed={theme === opt.value}
                        className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-semibold border transition-colors ${
                          theme === opt.value
                            ? 'bg-primary text-white border-primary'
                            : 'border-input-border dark:border-dark-border text-text-muted dark:text-dark-text-secondary hover:bg-soft-blue dark:hover:bg-dark-border/50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xl">{opt.icon}</span>
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Language */}
                <div className="p-4">
                  <p className="text-sm font-semibold text-text-main dark:text-white mb-2">{t('settings.language')}</p>
                  <select
                    value={locale}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    disabled={saving}
                    className="w-full border border-input-border dark:border-dark-border rounded-xl px-4 py-2.5 text-text-main dark:text-white bg-background-light dark:bg-dark-bg focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                  >
                    {languages.length > 0 ? (
                      languages.map((lang) => (
                        <option key={lang.code} value={lang.code}>{lang.name}</option>
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

            {/* Preferences */}
            <section>
              <h2 className="text-[11px] font-bold text-text-muted dark:text-dark-text-secondary uppercase tracking-[0.2em] mb-3 ml-2">
                {t('settings.preferences')}
              </h2>
              <div className="bg-white dark:bg-dark-surface rounded-2xl border border-input-border dark:border-dark-border overflow-hidden">
                <label className="flex items-center justify-between p-4 cursor-pointer hover:bg-soft-blue dark:hover:bg-dark-border/30">
                  <span className="text-sm font-semibold text-text-main dark:text-white">{t('settings.notifications')}</span>
                  <input
                    type="checkbox"
                    checked={settings?.notifications_on ?? true}
                    onChange={(e) => handleNotificationsToggle(e.target.checked)}
                    disabled={saving}
                    className="w-4 h-4 rounded border-input-border text-primary accent-primary"
                  />
                </label>
              </div>
            </section>

            {/* Support */}
            <section>
              <h2 className="text-[11px] font-bold text-text-muted dark:text-dark-text-secondary uppercase tracking-[0.2em] mb-3 ml-2">
                {t('settings.support')}
              </h2>
              <div className="bg-white dark:bg-dark-surface rounded-2xl border border-input-border dark:border-dark-border overflow-hidden divide-y divide-slate-50 dark:divide-dark-border">
                <a
                  href="#about"
                  className="flex items-center justify-between p-4 text-text-main dark:text-white hover:bg-soft-blue dark:hover:bg-dark-border/30 transition-colors"
                >
                  <span className="text-sm font-medium">{t('settings.about')}</span>
                  <span className="material-symbols-outlined text-text-muted dark:text-dark-text-secondary text-lg">chevron_right</span>
                </a>
                <a
                  href="#terms"
                  className="flex items-center justify-between p-4 text-text-main dark:text-white hover:bg-soft-blue dark:hover:bg-dark-border/30 transition-colors"
                >
                  <span className="text-sm font-medium">{t('settings.termsOfService')}</span>
                  <span className="material-symbols-outlined text-text-muted dark:text-dark-text-secondary text-lg">chevron_right</span>
                </a>
              </div>
            </section>

            {/* Account / danger zone */}
            <section>
              <h2 className="text-[11px] font-bold text-text-muted dark:text-dark-text-secondary uppercase tracking-[0.2em] mb-3 ml-2">
                {t('profile.account')}
              </h2>
              <div className="bg-white dark:bg-dark-surface rounded-2xl border border-input-border dark:border-dark-border overflow-hidden">
                {!deleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    className="w-full flex items-center justify-between p-4 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <span className="text-sm font-semibold">{t('settings.deleteAccount')}</span>
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                  </button>
                ) : (
                  <div className="p-4 space-y-3">
                    <p className="text-sm text-text-muted dark:text-dark-text-secondary">
                      {t('settings.deleteAccountConfirm')}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(false)}
                        className="flex-1 py-2.5 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-semibold text-sm hover:bg-soft-blue dark:hover:bg-dark-border/50 transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirm(false);
                          alert(t('settings.deleteAccountConfirm'));
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-colors"
                      >
                        {t('settings.deleteAccount')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
