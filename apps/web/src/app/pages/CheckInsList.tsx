import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { getMyCheckIns } from '@/lib/api/client';
import type { CheckIn } from '@/lib/types';

export default function CheckInsList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchList = useCallback(() => {
    setLoading(true);
    setError('');
    getMyCheckIns()
      .then(setCheckIns)
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <button
        type="button"
        onClick={() => navigate('/profile')}
        className="flex items-center gap-2 text-text-muted hover:text-primary mb-6"
      >
        <span className="material-symbols-outlined">arrow_back</span>
        Back
      </button>
      <h1 className="text-xl font-bold text-text-main mb-2">{t('profile.visitedPlaces')}</h1>
      <p className="text-text-muted text-sm mb-6">{t('profile.yourJourney')}</p>

      {loading && <p className="text-text-muted">{t('common.loading')}</p>}
      {error && (
        <div className="py-4">
          <p className="text-red-600 mb-2">{error}</p>
          <button type="button" onClick={fetchList} className="text-primary font-medium">
            {t('common.retry')}
          </button>
        </div>
      )}
      {!loading && !error && checkIns.length === 0 && (
        <div className="text-center py-12 rounded-2xl border border-input-border bg-gray-50 dark:bg-gray-800/50">
          <span className="material-symbols-outlined text-5xl text-text-muted mb-3 block">location_off</span>
          <p className="text-text-muted mb-4">{t('profile.noCheckInsYet')}</p>
          <Link to="/home" className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium">
            {t('profile.exploreCta')}
          </Link>
        </div>
      )}
      {!loading && !error && checkIns.length > 0 && (
        <ul className="space-y-3">
          {checkIns.map((c) => (
            <li key={c.check_in_code}>
              <Link
                to={`/places/${c.place_code}`}
                className="flex items-center gap-4 p-4 rounded-xl border border-input-border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined">place</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-main truncate">{c.place?.name ?? c.place_code}</p>
                  <p className="text-xs text-text-muted">
                    {c.checked_in_at ? new Date(c.checked_in_at).toLocaleDateString() : ''}
                  </p>
                </div>
                <span className="material-symbols-outlined text-text-muted shrink-0">chevron_right</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
