import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/providers';
import { useI18n } from '@/app/providers';
import { getMyStats, getMyCheckIns } from '@/lib/api/client';
import ErrorState from '@/components/ErrorState';
import type { UserStats } from '@/lib/types';

export default function Profile() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [checkInCount, setCheckInCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, checkIns] = await Promise.all([getMyStats(), getMyCheckIns()]);
      setStats(s);
      setCheckInCount(Array.isArray(checkIns) ? checkIns.length : 0);
    } catch (e) {
      setStats(null);
      setCheckInCount(0);
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!user) return null;

  const displayName = user.display_name?.trim() || user.email?.split('@')[0] || '';

  return (
    <div className="max-w-md md:max-w-2xl mx-auto px-4 py-6 pb-24 md:pb-6">
      {error && (
        <div className="mb-6">
          <ErrorState message={error} onRetry={fetchData} retryLabel={t('common.retry')} />
        </div>
      )}
      <header className="flex flex-col items-center text-center mb-8">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center text-primary text-3xl font-bold mb-3 overflow-hidden">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            (displayName || '?').charAt(0).toUpperCase()
          )}
        </div>
        <h1 className="text-2xl font-semibold text-text-main">{displayName}</h1>
        {user.email && <p className="text-sm text-text-muted mt-1">{user.email}</p>}
        <Link
          to="/profile/edit"
          className="inline-flex items-center gap-2 mt-4 text-primary font-medium text-sm hover:text-primary-hover"
        >
          <span className="material-symbols-outlined text-lg">edit</span>
          {t('profile.editProfile')}
        </Link>
      </header>

      {loading && !error ? (
        <p className="text-text-muted text-sm">{t('common.loading')}</p>
      ) : null}
      {!loading && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-primary uppercase tracking-wide mb-3">{t('profile.stats')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-input-border bg-gray-50 dark:bg-gray-800/50 p-4 text-center">
              <p className="text-2xl font-bold text-text-main">{stats?.placesVisited ?? 0}</p>
              <p className="text-sm text-text-muted mt-1">{t('profile.placesVisited')}</p>
            </div>
            <div className="rounded-xl border border-input-border bg-gray-50 dark:bg-gray-800/50 p-4 text-center">
              <p className="text-2xl font-bold text-text-main">{stats?.checkInsThisYear ?? 0}</p>
              <p className="text-sm text-text-muted mt-1">{t('profile.checkInsThisYear')}</p>
            </div>
          </div>
        </section>
      )}

      <nav className="space-y-2" aria-label="Profile menu">
        <Link
          to="/profile/check-ins"
          className="flex items-center justify-between p-4 rounded-xl border border-input-border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <span className="flex items-center gap-3 text-text-main font-medium">
            <span className="material-symbols-outlined text-primary">location_on</span>
            {t('profile.visitedPlaces')}
          </span>
          {checkInCount != null && (
            <span className="text-sm text-text-muted">{checkInCount}</span>
          )}
          <span className="material-symbols-outlined text-text-muted">chevron_right</span>
        </Link>
        <Link
          to="/favorites"
          className="flex items-center justify-between p-4 rounded-xl border border-input-border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <span className="flex items-center gap-3 text-text-main font-medium">
            <span className="material-symbols-outlined text-primary">bookmark</span>
            Favorite Places
          </span>
          <span className="material-symbols-outlined text-text-muted">chevron_right</span>
        </Link>
        <Link
          to="/groups"
          className="flex items-center justify-between p-4 rounded-xl border border-input-border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <span className="flex items-center gap-3 text-text-main font-medium">
            <span className="material-symbols-outlined text-primary">groups</span>
            Group Activity
          </span>
          <span className="material-symbols-outlined text-text-muted">chevron_right</span>
        </Link>
        <Link
          to="/settings"
          className="flex items-center justify-between p-4 rounded-xl border border-input-border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <span className="flex items-center gap-3 text-text-main font-medium">
            <span className="material-symbols-outlined text-primary">settings</span>
            Settings
          </span>
          <span className="material-symbols-outlined text-text-muted">chevron_right</span>
        </Link>
      </nav>
    </div>
  );
}
