import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useI18n, useTheme } from '@/app/providers';
import { getMyStats, getSettings, updateSettings } from '@/lib/api/client';
import ErrorState from '@/components/common/ErrorState';
import { applyTheme } from '@/lib/theme';
import type { UserStats, Religion } from '@/lib/types';

const RELIGIONS = [
  { code: 'islam' as const, emoji: '🕌', labelKey: 'common.islam' },
  { code: 'hinduism' as const, emoji: '🛕', labelKey: 'common.hinduism' },
  { code: 'christianity' as const, emoji: '⛪', labelKey: 'common.christianity' },
];

const APP_VERSION = '2.4.0';

function formatJoinedDate(createdAt: string | undefined): string {
  if (!createdAt) return '';
  try {
    const d = new Date(createdAt);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t, locale, languages, setLocale } = useI18n();
  const { isDark, setTheme, units, setUnits } = useTheme();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const [pathOpen, setPathOpen] = useState(false);
  const [selectedReligions, setSelectedReligions] = useState<Religion[]>([]);
  const [, setNotifOn] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, sett] = await Promise.all([getMyStats(), getSettings()]);
      setStats(s);
      if (sett.notifications_on != null) setNotifOn(!!sett.notifications_on);
    } catch (e) {
      setStats(null);
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (user) fetchData();
    else setLoading(false);
  }, [user, fetchData]);

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || '';
  const visits = stats?.visits ?? stats?.placesVisited ?? 0;
  const reviews = stats?.reviews ?? 0;
  const joinedStr = user ? formatJoinedDate(user.created_at) : '';
  const religions = user?.religions ?? [];
  const pathSubtext = religions.includes('all')
    ? t('common.allReligions')
    : religions.length > 0
      ? religions.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')
      : t('profile.myPathSubtext');

  const openPathSheet = () => {
    setSelectedReligions(user?.religions ?? []);
    setPathOpen(true);
  };

  const toggleReligion = (code: Religion) => {
    if (code === 'all') {
      setSelectedReligions((prev) => (prev.includes('all') ? [] : ['all']));
    } else {
      setSelectedReligions((prev) => {
        const without = prev.filter((r) => r !== 'all' && r !== code);
        return prev.includes(code) ? without : [...without, code];
      });
    }
  };

  const handleSavePath = async () => {
    setPathOpen(false);
    try {
      await updateSettings({ religions: selectedReligions });
      // Refresh user to show updated subtext
      await getSettings();
      if (user) fetchData();
    } catch {
      /* ignore */
    }
  };

  const handleLangSelect = async (code: string) => {
    setLangOpen(false);
    await setLocale(code);
    if (user) {
      try {
        await updateSettings({ language: code });
      } catch {
        /* ignore */
      }
    }
  };

  const handleThemeToggle = (on: boolean) => {
    const t2 = on ? 'dark' : 'light';
    setTheme(t2);
    applyTheme(t2);
    if (user) updateSettings({ theme: t2 }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-dark-bg">
      {/* gradient header bg */}
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-blue-50 to-transparent dark:from-dark-surface/30 dark:to-transparent pointer-events-none z-0" />

      <div className="relative z-10 max-w-sm mx-auto px-4 py-6 pb-28">
        {error && user && (
          <div className="mb-6">
            <ErrorState message={error} onRetry={fetchData} retryLabel={t('common.retry')} />
          </div>
        )}

        {/* Header */}
        <header className="flex justify-between items-center py-4 pt-6">
          <div className="w-10" />
          <h1 className="text-sm font-bold uppercase tracking-widest text-text-muted dark:text-dark-text-secondary">
            {t('profile.title')}
          </h1>
          <div className="w-10" />
        </header>

        {/* Avatar + name (only for logged-in users) */}
        {user && (
          <section className="flex flex-col items-center px-2 pb-8 pt-4">
            <div className="w-28 h-28 rounded-full p-1 bg-white dark:bg-dark-surface border border-blue-100 dark:border-dark-border shadow-xl shadow-blue-50 dark:shadow-none overflow-hidden mb-5">
              <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center text-primary text-4xl font-bold">
                {(displayName || '?').charAt(0).toUpperCase()}
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                {displayName}
              </h2>
              {joinedStr && (
                <p className="inline-flex items-center gap-1.5 mt-2.5 text-slate-400 dark:text-dark-text-secondary text-xs font-semibold uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                  {t('profile.joined').replace('{date}', joinedStr)}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Visitor greeting (no user) */}
        {!user && (
          <section className="flex flex-col items-center px-2 pb-6 pt-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <span className="material-icons text-4xl text-primary">person_outline</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {t('profile.title')}
            </h2>
          </section>
        )}

        {/* Stats — only for authenticated users */}
        {user && (
          <section className="px-2 mb-8">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-dark-surface rounded-3xl border border-slate-100 dark:border-dark-border p-5 shadow-subtle">
                {loading ? (
                  <div className="h-8 w-10 bg-slate-100 dark:bg-dark-border rounded animate-pulse mb-2" />
                ) : (
                  <span className="text-[30px] font-bold text-slate-900 dark:text-white leading-none">
                    {visits}
                  </span>
                )}
                <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-400 dark:text-dark-text-secondary mt-1">
                  {t('profile.myCheckIns')}
                </p>
              </div>
              <div className="bg-white dark:bg-dark-surface rounded-3xl border border-slate-100 dark:border-dark-border p-5 shadow-subtle">
                {loading ? (
                  <div className="h-8 w-10 bg-slate-100 dark:bg-dark-border rounded animate-pulse mb-2" />
                ) : (
                  <span className="text-[30px] font-bold text-slate-900 dark:text-white leading-none">
                    {reviews}
                  </span>
                )}
                <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-400 dark:text-dark-text-secondary mt-1">
                  {t('profile.reviews')}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Preferences section — visible for all */}
        <section className="px-2 mb-6">
          <h3 className="text-[11px] font-bold text-slate-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] mb-3 ml-2">
            {t('profile.preferences')}
          </h3>
          <div className="bg-white dark:bg-dark-surface rounded-3xl border border-slate-100 dark:border-dark-border shadow-subtle overflow-hidden">
            {/* My Path */}
            <button
              type="button"
              onClick={openPathSheet}
              className="w-full flex items-center justify-between p-4 pl-5 hover:bg-slate-50 dark:hover:bg-dark-border/30 transition-colors border-b border-slate-50 dark:border-dark-border text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                  <span className="material-icons text-xl text-primary">map</span>
                </div>
                <div>
                  <p className="font-semibold text-text-main dark:text-white text-sm">
                    {t('profile.myPath')}
                  </p>
                  <p className="text-xs text-text-muted dark:text-dark-text-secondary mt-0.5">
                    {pathSubtext}
                  </p>
                </div>
              </div>
              <span className="material-icons-round text-text-muted dark:text-dark-text-secondary text-lg">
                chevron_right
              </span>
            </button>

            {/* Language */}
            <button
              type="button"
              onClick={() => setLangOpen(true)}
              className="w-full flex items-center justify-between p-4 pl-5 hover:bg-slate-50 dark:hover:bg-dark-border/30 transition-colors border-b border-slate-50 dark:border-dark-border text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                  <span className="material-icons text-xl text-primary">language</span>
                </div>
                <div>
                  <p className="font-semibold text-text-main dark:text-white text-sm">
                    {t('profile.language')}
                  </p>
                  <p className="text-xs text-text-muted dark:text-dark-text-secondary mt-0.5">
                    {languages.find((l) => l.code === locale)?.name ?? locale.toUpperCase()}
                  </p>
                </div>
              </div>
              <span className="material-icons-round text-text-muted dark:text-dark-text-secondary text-lg">
                chevron_right
              </span>
            </button>

            {/* Notifications — only for authenticated users */}
            {user && (
              <Link
                to="/notifications"
                className="w-full flex items-center justify-between p-4 pl-5 hover:bg-slate-50 dark:hover:bg-dark-border/30 transition-colors border-b border-slate-50 dark:border-dark-border"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <span className="material-icons text-xl text-primary">notifications</span>
                  </div>
                  <div>
                    <p className="font-semibold text-text-main dark:text-white text-sm">
                      {t('profile.notifications')}
                    </p>
                    <p className="text-xs text-text-muted dark:text-dark-text-secondary mt-0.5">
                      {t('profile.notificationsSubtext')}
                    </p>
                  </div>
                </div>
                <span className="material-icons-round text-text-muted dark:text-dark-text-secondary text-lg">
                  chevron_right
                </span>
              </Link>
            )}

            {/* Distance Units toggle */}
            <div className="flex items-center justify-between p-4 pl-5 border-b border-slate-50 dark:border-dark-border">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                  <span className="material-icons text-xl text-primary">straighten</span>
                </div>
                <p className="font-semibold text-text-main dark:text-white text-sm">
                  {t('settings.distanceUnits')}
                </p>
              </div>
              <div className="flex rounded-xl border border-input-border dark:border-dark-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setUnits('km')}
                  className={`px-3 py-1 text-xs font-semibold transition-colors ${
                    units === 'km'
                      ? 'bg-primary text-white'
                      : 'text-text-muted dark:text-dark-text-secondary hover:bg-slate-50 dark:hover:bg-dark-border/30'
                  }`}
                >
                  {t('settings.km')}
                </button>
                <button
                  type="button"
                  onClick={() => setUnits('miles')}
                  className={`px-3 py-1 text-xs font-semibold transition-colors ${
                    units === 'miles'
                      ? 'bg-primary text-white'
                      : 'text-text-muted dark:text-dark-text-secondary hover:bg-slate-50 dark:hover:bg-dark-border/30'
                  }`}
                >
                  {t('settings.miles')}
                </button>
              </div>
            </div>

            {/* Dark Mode toggle */}
            <div className="flex items-center justify-between p-4 pl-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                  <span className="material-icons text-xl text-primary">dark_mode</span>
                </div>
                <p className="font-semibold text-text-main dark:text-white text-sm">
                  {t('settings.darkMode')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isDark}
                onClick={() => handleThemeToggle(!isDark)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isDark ? 'bg-primary' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Account section — only for authenticated users */}
        {user && (
          <section className="px-2 mb-6">
            <h3 className="text-[11px] font-bold text-slate-400 dark:text-dark-text-secondary uppercase tracking-[0.2em] mb-3 ml-2">
              {t('profile.account')}
            </h3>
            <div className="bg-white dark:bg-dark-surface rounded-3xl border border-slate-100 dark:border-dark-border shadow-subtle overflow-hidden">
              <Link
                to="/profile/check-ins"
                className="w-full flex items-center justify-between p-4 pl-5 hover:bg-slate-50 dark:hover:bg-dark-border/30 transition-colors border-b border-slate-50 dark:border-dark-border"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center">
                    <span className="material-icons-round text-lg">history_edu</span>
                  </div>
                  <span className="font-semibold text-text-main dark:text-white text-sm">
                    {t('profile.myCheckIns')}
                  </span>
                </div>
                <span className="material-icons-round text-text-muted dark:text-dark-text-secondary text-lg">
                  chevron_right
                </span>
              </Link>
              <Link
                to="/favorites"
                className="w-full flex items-center justify-between p-4 pl-5 hover:bg-slate-50 dark:hover:bg-dark-border/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 flex items-center justify-center">
                    <span className="material-icons-round text-lg">favorite</span>
                  </div>
                  <span className="font-semibold text-text-main dark:text-white text-sm">
                    {t('profile.favorites')}
                  </span>
                </div>
                <span className="material-icons-round text-text-muted dark:text-dark-text-secondary text-lg">
                  chevron_right
                </span>
              </Link>
            </div>
          </section>
        )}

        {/* Edit profile button — only for authenticated users */}
        {user && (
          <section className="px-2 mb-6">
            <Link
              to="/profile/edit"
              className="w-full bg-slate-900 dark:bg-white/10 hover:bg-slate-800 dark:hover:bg-white/20 text-white font-bold py-4 px-4 rounded-2xl transition-all shadow-xl shadow-slate-200 dark:shadow-none flex items-center justify-center gap-2 group"
            >
              <span className="material-symbols-outlined text-xl group-hover:scale-110 transition-transform">
                edit
              </span>
              {t('profile.editProfile')}
            </Link>
          </section>
        )}

        {/* Logout — for authenticated users */}
        {user && (
          <div className="px-2 mb-4">
            <button
              type="button"
              onClick={async () => {
                await logout();
              }}
              className="w-full flex items-center justify-center gap-2 py-4 text-red-500 font-semibold hover:text-red-600 transition-colors"
            >
              <span className="material-icons text-lg">logout</span>
              {t('auth.logout')}
            </button>
          </div>
        )}

        {/* Login / Create Account — for visitors */}
        {!user && (
          <div className="px-2 mb-4 space-y-3">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-100 dark:shadow-none flex items-center justify-center gap-2 transition-all"
            >
              <span className="material-icons text-lg">login</span>
              {t('profile.logIn')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="w-full border-2 border-primary text-primary font-semibold py-4 rounded-2xl hover:bg-primary/5 flex items-center justify-center gap-2 transition-all"
            >
              <span className="material-icons text-lg">person_add</span>
              {t('visitor.createAccount')}
            </button>
          </div>
        )}

        {/* Version */}
        <div className="flex justify-center">
          <p className="text-[10px] font-medium text-text-muted dark:text-dark-text-secondary">
            {t('profile.version').replace('{version}', APP_VERSION)}
          </p>
        </div>
      </div>

      {/* My Path picker modal sheet */}
      {pathOpen && (
        <div className="fixed inset-0 z-[600] flex items-end" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setPathOpen(false)}
            aria-label="Close"
          />
          <div className="relative w-full bg-white dark:bg-dark-surface rounded-t-3xl px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[70vh] overflow-y-auto">
            <div className="w-10 h-1 bg-slate-200 dark:bg-dark-border rounded-full mx-auto mb-4" />
            <h2 className="text-lg font-bold text-text-dark dark:text-white mb-1">
              {t('profile.myPath')}
            </h2>
            <p className="text-xs text-text-muted dark:text-dark-text-secondary mb-4">
              {t('selectPath.subtitle')}
            </p>

            {/* All option */}
            <button
              type="button"
              onClick={() => toggleReligion('all')}
              className="w-full flex items-center gap-4 py-3.5 border-b border-slate-100 dark:border-dark-border text-left"
            >
              <span className="text-2xl">🌍</span>
              <span
                className={`flex-1 text-base ${selectedReligions.includes('all') ? 'text-primary font-semibold' : 'text-text-dark dark:text-white'}`}
              >
                {t('common.allReligions')}
              </span>
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedReligions.includes('all') ? 'bg-primary border-primary' : 'border-slate-300 dark:border-dark-border'}`}
              >
                {selectedReligions.includes('all') && (
                  <span className="material-icons text-white text-[14px]">check</span>
                )}
              </span>
            </button>

            {RELIGIONS.map(({ code, emoji, labelKey }) => (
              <button
                key={code}
                type="button"
                onClick={() => toggleReligion(code)}
                className="w-full flex items-center gap-4 py-3.5 border-b border-slate-100 dark:border-dark-border last:border-0 text-left"
              >
                <span className="text-2xl">{emoji}</span>
                <span
                  className={`flex-1 text-base ${!selectedReligions.includes('all') && selectedReligions.includes(code) ? 'text-primary font-semibold' : 'text-text-dark dark:text-white'}`}
                >
                  {t(labelKey)}
                </span>
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${!selectedReligions.includes('all') && selectedReligions.includes(code) ? 'bg-primary border-primary' : 'border-slate-300 dark:border-dark-border'}`}
                >
                  {!selectedReligions.includes('all') && selectedReligions.includes(code) && (
                    <span className="material-icons text-white text-[14px]">check</span>
                  )}
                </span>
              </button>
            ))}

            <button
              type="button"
              onClick={handleSavePath}
              className="w-full mt-5 bg-primary text-white font-semibold py-3.5 rounded-2xl hover:bg-blue-600 transition-colors"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {/* Language picker modal sheet */}
      {langOpen && (
        <div className="fixed inset-0 z-[600] flex items-end" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setLangOpen(false)}
            aria-label="Close"
          />
          <div className="relative w-full bg-white dark:bg-dark-surface rounded-t-3xl px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[60vh] overflow-y-auto">
            <div className="w-10 h-1 bg-slate-200 dark:bg-dark-border rounded-full mx-auto mb-4" />
            <h2 className="text-lg font-bold text-text-dark dark:text-white mb-3">
              {t('profile.language')}
            </h2>
            {languages.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleLangSelect(lang.code)}
                className="w-full flex items-center justify-between py-3.5 border-b border-slate-100 dark:border-dark-border last:border-0 text-left"
              >
                <span
                  className={`text-base ${locale === lang.code ? 'text-primary font-semibold' : 'text-text-dark dark:text-white'}`}
                >
                  {lang.name}
                </span>
                {locale === lang.code && (
                  <span className="material-icons text-lg text-primary">check</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
