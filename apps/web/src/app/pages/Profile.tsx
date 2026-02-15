import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/providers';
import { useI18n } from '@/app/providers';
import { getMyStats } from '@/lib/api/client';
import ErrorState from '@/components/ErrorState';
import type { UserStats } from '@/lib/types';

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
  const { user } = useAuth();
  const { t } = useI18n();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await getMyStats();
      setStats(s);
    } catch (e) {
      setStats(null);
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
  const visits = stats?.visits ?? stats?.placesVisited ?? 0;
  const reviews = stats?.reviews ?? 0;
  const badges = stats?.badges_count ?? 0;
  const joinedStr = formatJoinedDate(user.created_at);
  const religions = user.religions ?? [];
  const primaryReligion = religions[0] ?? 'islam';

  return (
    <div className="min-h-screen bg-background-light relative">
      <div className="absolute top-0 left-0 w-full h-80 bg-gradient-to-b from-blue-50 to-transparent pointer-events-none z-0" />
      <div className="relative z-10 max-w-sm mx-auto px-4 py-6 pb-24">
        {error && (
          <div className="mb-6">
            <ErrorState message={error} onRetry={fetchData} retryLabel={t('common.retry')} />
          </div>
        )}

        <header className="flex justify-between items-center py-4 pt-6">
          <div className="w-10" />
          <h1 className="text-sm font-medium uppercase tracking-widest text-text-muted">
            {t('profile.title')}
          </h1>
          <Link
            to="/settings"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/50 backdrop-blur-md hover:bg-white border border-slate-200/50 text-text-secondary"
            aria-label={t('settings.title')}
          >
            <span className="material-icons-outlined">settings</span>
          </Link>
        </header>

        <section className="flex flex-col items-center px-2 pb-6">
          <div className="w-36 h-36 rounded-full p-1 bg-white border border-blue-100 shadow-soft overflow-hidden mb-4">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-primary/20 flex items-center justify-center text-primary text-4xl font-bold">
                {(displayName || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-text-dark tracking-tight">{displayName}</h2>
            {joinedStr && (
              <p className="inline-flex items-center gap-1.5 mt-2 text-text-muted text-xs font-medium">
                <span className="material-icons-outlined text-[14px]">calendar_today</span>
                {t('profile.joined').replace('{date}', joinedStr)}
              </p>
            )}
          </div>
        </section>

        <section className="px-2 mb-8">
          <div className="flex justify-between items-center px-4 py-3 border-b border-slate-50 bg-white rounded-2xl border border-slate-100 shadow-subtle">
            <div className="flex flex-col items-center flex-1 border-r border-slate-100">
              <span className="text-2xl font-bold text-text-dark">{visits}</span>
              <span className="text-[10px] uppercase tracking-wider font-medium text-text-muted mt-1">
                {t('profile.visits')}
              </span>
            </div>
            <div className="flex flex-col items-center flex-1 border-r border-slate-100">
              <span className="text-2xl font-bold text-text-dark">{reviews}</span>
              <span className="text-[10px] uppercase tracking-wider font-medium text-text-muted mt-1">
                {t('profile.reviews')}
              </span>
            </div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-2xl font-bold text-text-dark">{badges}</span>
              <span className="text-[10px] uppercase tracking-wider font-medium text-text-muted mt-1">
                {t('profile.badges')}
              </span>
            </div>
          </div>
        </section>

        <section className="px-2 mb-8">
          <div className="bg-slate-50 rounded-2xl p-1.5 flex items-center shadow-inner-light">
            <Link
              to="/select-path"
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 rounded-xl transition-all ${
                primaryReligion === 'islam'
                  ? 'bg-white shadow-sm border border-slate-200/60 text-text-dark font-semibold'
                  : 'text-text-muted font-medium hover:text-text-secondary'
              }`}
            >
              <span className="material-symbols-outlined text-xl text-accent">mosque</span>
              <span className="text-sm">{t('common.islam')}</span>
            </Link>
            <Link
              to="/select-path"
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 rounded-xl transition-all ${
                primaryReligion === 'christianity'
                  ? 'bg-white shadow-sm border border-slate-200/60 text-text-dark font-semibold'
                  : 'text-text-muted font-medium hover:text-text-secondary'
              }`}
            >
              <span className="material-symbols-outlined text-xl">church</span>
              <span className="text-sm">{t('common.christianity')}</span>
            </Link>
            <Link
              to="/select-path"
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 rounded-xl transition-all ${
                primaryReligion === 'hinduism'
                  ? 'bg-white shadow-sm border border-slate-200/60 text-text-dark font-semibold'
                  : 'text-text-muted font-medium hover:text-text-secondary'
              }`}
            >
              <span className="material-symbols-outlined text-xl">temple_hindu</span>
              <span className="text-sm">{t('common.hinduism')}</span>
            </Link>
          </div>
          <p className="text-center text-[10px] text-text-muted mt-2 font-medium tracking-wide">
            {t('profile.selectPilgrimagePath')}
          </p>
        </section>

        <section className="px-2 mb-6">
          <Link
            to="/profile/edit"
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
          >
            <span className="material-icons-outlined text-lg">edit</span>
            {t('profile.editProfile')}
          </Link>
        </section>

        <section className="flex-1 px-1 pb-4">
          <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3 ml-2">
            {t('profile.account')}
          </h3>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-subtle overflow-hidden">
            <Link
              to="/profile/check-ins"
              className="w-full flex items-center justify-between p-4 pl-5 hover:bg-slate-50 transition-colors group border-b border-slate-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <span className="material-icons-round text-lg">history_edu</span>
                </div>
                <span className="font-medium text-text-main text-sm">
                  {t('profile.myCheckIns')}
                </span>
              </div>
              <span className="material-icons-round text-text-muted text-lg">chevron_right</span>
            </Link>
            <Link
              to="/favorites"
              className="w-full flex items-center justify-between p-4 pl-5 hover:bg-slate-50 transition-colors group border-b border-slate-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <span className="material-icons-round text-lg">favorite</span>
                </div>
                <span className="font-medium text-text-main text-sm">
                  {t('profile.favoritePlaces')}
                </span>
              </div>
              <span className="material-icons-round text-text-muted text-lg">chevron_right</span>
            </Link>
            <Link
              to="/groups"
              className="w-full flex items-center justify-between p-4 pl-5 hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <span className="material-icons-round text-lg">groups</span>
                </div>
                <span className="font-medium text-text-main text-sm">
                  {t('profile.groupActivity')}
                </span>
              </div>
              <span className="material-icons-round text-text-muted text-lg">chevron_right</span>
            </Link>
          </div>
          <div className="mt-8 mb-4 flex justify-center">
            <p className="text-[10px] font-medium text-text-muted">
              {t('profile.version').replace('{version}', APP_VERSION)}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
