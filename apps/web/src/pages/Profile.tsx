import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { getMyStats, getMyCheckIns } from '@/api/client';
import type { UserStats, CheckIn } from '@/types';

export default function Profile() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchProfile = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([getMyStats(), getMyCheckIns()])
      .then(([s, c]) => {
        setStats(s);
        setCheckIns(c);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyStats(), getMyCheckIns()])
      .then(([s, c]) => {
        if (!cancelled) {
          setStats(s);
          setCheckIns(c);
        }
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : t('common.error')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  if (!user) return null;

  return (
    <div className="max-w-md mx-auto px-5 py-6 md:max-w-2xl">
      <header className="mb-6">
        <p className="text-sm text-primary font-medium uppercase tracking-wide mb-1">{t('profile.title')}</p>
        <h1 className="text-2xl font-semibold text-text-main">{t('profile.yourJourney')}</h1>
      </header>

      <div className="flex items-center gap-4 mb-6 p-4 bg-white rounded-2xl border border-gray-200">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="material-icons text-3xl text-primary" aria-hidden>person</span>
        </div>
        <div>
          <h2 className="text-lg font-bold text-text-main">{user.display_name}</h2>
          <p className="text-sm text-text-muted">{user.email}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <p className="text-red-600 mb-2">{error}</p>
          <button type="button" onClick={fetchProfile} className="text-primary font-medium">{t('common.retry')}</button>
        </div>
      )}
      {loading ? (
        <p className="text-text-muted">{t('common.loading')}</p>
      ) : stats && !error && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-4 bg-white rounded-2xl border border-gray-200">
            <p className="text-2xl font-bold text-primary">{stats.placesVisited}</p>
            <p className="text-sm text-text-muted">{t('profile.sitesVisited')}</p>
          </div>
          <div className="p-4 bg-white rounded-2xl border border-gray-200">
            <p className="text-2xl font-bold text-primary">{stats.checkInsThisYear}</p>
            <p className="text-sm text-text-muted">{t('profile.checkInsThisYear')}</p>
          </div>
        </div>
      )}

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-text-main mb-3">{t('profile.visitedPlaces')}</h2>
        {checkIns.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
            <span className="material-symbols-outlined text-4xl text-gray-300 mb-2 block">location_on</span>
            <p className="text-text-muted text-sm">{t('profile.noCheckInsYet')}</p>
            <p className="text-text-muted text-sm mb-3">{t('home.explorePlaces')}</p>
            <Link to="/home" className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium">{t('profile.exploreCta')}</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {checkIns.slice(0, 10).map((c) => (
              <Link
                key={c.check_in_code}
                to={`/places/${c.place_code}`}
                className="block p-3 bg-white rounded-xl border border-gray-200 hover:shadow-sm"
              >
                <p className="font-medium text-text-main">{c.place?.name ?? c.place_code}</p>
                <p className="text-xs text-text-muted">{c.place?.address} · {new Date(c.checked_in_at).toLocaleDateString()}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6">
        <Link to="/favorites" className="block p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-sm font-medium text-text-main mb-2">
          {t('nav.favorites')}
        </Link>
        <Link to="/settings" className="block p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-sm font-medium text-text-main">
          {t('nav.settings')}
        </Link>
      </section>

      <Link to="/profile/edit" className="block w-full py-3 rounded-xl border border-primary text-primary text-center font-medium">
        {t('profile.editProfile')}
      </Link>
    </div>
  );
}
