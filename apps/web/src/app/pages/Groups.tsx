import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useI18n } from '@/app/providers';
import { getGroups } from '@/lib/api/client';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import type { Group } from '@/lib/types';

function formatRelative(iso: string | null | undefined, t: (key: string) => string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffM = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffM / 60);
    const diffD = Math.floor(diffH / 24);
    if (diffM < 1) return t('common.timeJustNow');
    if (diffM < 60) return t('common.timeMinutesAgo').replace('{count}', String(diffM));
    if (diffH < 24) return t('common.timeHoursAgo').replace('{count}', String(diffH));
    if (diffD < 7) return t('common.timeDaysAgo').replace('{count}', String(Math.max(1, diffD)));
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

function progressLevel(sites: number, total: number, t: (key: string) => string): string {
  if (total <= 0) return '';
  const pct = Math.floor((sites / total) * 100);
  if (pct >= 100) return t('common.done');
  if (pct >= 80) return t('groups.level').replace('{level}', '5');
  if (pct >= 60) return t('groups.level').replace('{level}', '4');
  if (pct >= 40) return t('groups.level').replace('{level}', '3');
  if (pct >= 20) return t('groups.level').replace('{level}', '2');
  if (sites > 0) return t('groups.level').replace('{level}', '1');
  return 'New';
}

export default function Groups() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchGroups = useCallback(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    getGroups()
      .then(setGroups)
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t, user]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const featured = groups.find((g) => g.featured);
  const rest = groups.filter((g) => g.group_code !== featured?.group_code);

  return (
    <div className="min-h-screen bg-background-light dark:bg-dark-bg">
      <header className="sticky top-0 z-40 bg-white dark:bg-dark-surface border-b border-slate-100 dark:border-dark-border px-4 md:px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text-dark dark:text-white">
          {t('groups.myGroups')}
        </h1>
      </header>

      <main className="max-w-md md:max-w-2xl mx-auto px-4 md:px-6 py-6 pb-28">
        {/* Visitor empty state */}
        {!user && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <span className="material-icons text-4xl text-primary">group</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {t('groups.loginRequired')}
            </h2>
            <p className="text-slate-500 dark:text-dark-text-secondary text-sm mb-8 max-w-xs">
              {t('groups.loginRequiredDesc')}
            </p>
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="w-full max-w-xs bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-100 dark:shadow-none transition-all mb-3"
            >
              {t('splash.getStarted')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full max-w-xs border-2 border-primary text-primary font-semibold py-4 rounded-2xl hover:bg-primary/5 transition-all"
            >
              {t('auth.login')}
            </button>
          </div>
        )}

        {user && loading && <p className="text-text-muted">{t('common.loading')}</p>}
        {user && error && (
          <ErrorState message={error} onRetry={fetchGroups} retryLabel={t('common.retry')} />
        )}
        {user && !loading && !error && groups.length === 0 && (
          <EmptyState
            icon="groups"
            title={t('groups.noGroupsYet')}
            description={t('groups.noGroupsDescription')}
            action={
              <Link
                to="/groups/new"
                className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover"
              >
                {t('groups.createGroup')}
              </Link>
            }
          />
        )}

        {user && !loading && !error && groups.length > 0 && (
          <>
            {featured && (
              <Link
                to={`/groups/${featured.group_code}`}
                className="block relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-300 via-blue-400 to-blue-500 shadow-lg shadow-blue-100 p-6 text-white mb-8 transition-transform hover:scale-[0.99] active:scale-[0.98]"
              >
                <div className="absolute top-0 right-0 p-3 opacity-20 pointer-events-none">
                  <span className="material-icons text-[120px] -mr-8 -mt-8 rotate-12">landscape</span>
                </div>
                <div className="relative z-10 flex justify-between items-start mb-6">
                  <div>
                    <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/30 backdrop-blur-sm border border-white/20 mb-3">
                      {t('groups.featured')}
                    </span>
                    <h2 className="text-2xl md:text-3xl font-bold leading-tight tracking-tight">
                      {featured.name}
                    </h2>
                    {featured.next_place_name && (
                      <p className="text-blue-100 text-sm mt-2 font-medium opacity-90">
                        {t('groups.next')}: {featured.next_place_name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="relative z-10">
                  <div className="flex justify-between text-xs font-semibold mb-2 text-white/90 uppercase tracking-wide">
                    <span>{t('groups.currentProgress')}</span>
                    <span>
                      {featured.total_sites
                        ? Math.round(((featured.sites_visited ?? 0) / featured.total_sites) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-black/10 rounded-full overflow-hidden backdrop-blur-sm">
                    <div
                      className="h-full bg-white rounded-full shadow-sm transition-all"
                      style={{
                        width: `${featured.total_sites ? Math.min(100, Math.round(((featured.sites_visited ?? 0) / featured.total_sites) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-6">
                    <div className="flex -space-x-3">
                      {[...Array(Math.min(3, featured.member_count ?? 0))].map((_, i) => (
                        <div key={i} className="h-10 w-10 rounded-full border-2 border-blue-400 bg-white/20 flex items-center justify-center text-blue-900 text-xs font-bold">
                          {i + 1}
                        </div>
                      ))}
                      {(featured.member_count ?? 0) > 3 && (
                        <div className="h-10 w-10 rounded-full border-2 border-blue-400 bg-white/20 flex items-center justify-center text-xs font-bold z-10">
                          +{(featured.member_count ?? 0) - 3}
                        </div>
                      )}
                    </div>
                    <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                      <span className="material-icons text-white">arrow_forward</span>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            <div className="space-y-0">
              {rest.map((g) => {
                const total = g.total_sites ?? 0;
                const visited = g.sites_visited ?? 0;
                const pct = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;
                const level = progressLevel(visited, total, t);
                const lastActive = formatRelative(g.last_activity ?? undefined, t);
                return (
                  <Link
                    key={g.group_code}
                    to={`/groups/${g.group_code}`}
                    className="block py-4 border-b border-slate-100 dark:border-dark-border hover:bg-slate-50/50 dark:hover:bg-dark-surface/50 transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-text-dark dark:text-white text-xl tracking-tight truncate">{g.name}</h3>
                          {level === 'Done' && (
                            <span className="material-icons text-green-500 text-sm shrink-0">check_circle</span>
                          )}
                        </div>
                        <p className="text-sm text-text-muted dark:text-dark-text-secondary font-medium">
                          {lastActive
                            ? t('groups.lastActive').replace('{relative}', lastActive)
                            : g.created_at
                              ? `${t('groups.created')} ${new Date(g.created_at).toLocaleDateString()}`
                              : ''}
                        </p>
                      </div>
                      <div className="flex -space-x-2 shrink-0">
                        {[...Array(Math.min(2, g.member_count ?? 0))].map((_, i) => (
                          <div key={i} className="h-8 w-8 rounded-full border-2 border-white dark:border-dark-bg bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary ring-1 ring-slate-100 dark:ring-dark-border">
                            {i + 1}
                          </div>
                        ))}
                        {(g.member_count ?? 0) > 2 && (
                          <div className="h-8 w-8 rounded-full border-2 border-white dark:border-dark-bg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-text-muted dark:text-dark-text-secondary ring-1 ring-slate-100 dark:ring-dark-border">
                            +{(g.member_count ?? 0) - 2}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs text-text-muted dark:text-dark-text-secondary mb-2 font-medium">
                      <span>
                        {t('groups.sitesCount')
                          .replace('{visited}', String(visited))
                          .replace('{total}', String(total || '—'))}
                      </span>
                      {level && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          level === 'Done' ? 'text-green-600 bg-green-50'
                            : level === 'New' ? 'text-indigo-600 bg-indigo-50'
                            : 'text-primary bg-blue-50'
                        }`}>
                          {level}
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-[3px] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${level === 'Done' ? 'bg-green-500' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </main>

      {user && (
        <Link
          to="/groups/new"
          className="fixed bottom-24 right-4 md:right-6 z-50 h-14 w-14 rounded-full bg-primary text-white shadow-xl shadow-blue-200 flex items-center justify-center hover:bg-primary-hover active:scale-90 transition-all"
          aria-label={t('groups.createGroup')}
        >
          <span className="material-icons text-2xl">add</span>
        </Link>
      )}
    </div>
  );
}
