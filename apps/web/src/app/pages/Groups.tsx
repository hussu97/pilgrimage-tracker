import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useI18n } from '@/app/providers';
import { cn } from '@/lib/utils/cn';
import { getGroups } from '@/lib/api/client';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
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
  return t('groups.progressNew');
}

function isRecentlyActive(iso: string | null | undefined): boolean {
  if (!iso) return false;
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    return diffMs < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
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

  return (
    <div className="min-h-screen bg-background-light dark:bg-dark-bg">
      <header className="sticky top-0 z-40 bg-white dark:bg-dark-surface border-b border-slate-100 dark:border-dark-border px-4 md:px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text-dark dark:text-white">
          {t('groups.myGroups')}
        </h1>
      </header>

      <main className="max-w-md md:max-w-4xl mx-auto px-4 md:px-6 py-6 pb-28">
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
              className="w-full max-w-xs bg-primary hover:bg-primary-hover text-white font-bold py-4 rounded-2xl shadow-md transition-all mb-3"
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
          />
        )}

        {user && !loading && !error && groups.length > 0 && (
          <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
            {groups.map((g) => {
              const total = g.total_sites ?? 0;
              const visited = g.sites_visited ?? 0;
              const pct = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;
              const level = progressLevel(visited, total, t);
              const lastActive = formatRelative(g.last_activity ?? undefined, t);
              const recently = isRecentlyActive(g.last_activity);
              const isDone = level === t('common.done') || level === 'Done';
              const isNew = level === t('groups.progressNew') || level === 'New';
              const coverUrl = g.cover_image_url ? getFullImageUrl(g.cover_image_url) : null;
              return (
                <Link
                  key={g.group_code}
                  to={`/groups/${g.group_code}`}
                  className={cn(
                    'block rounded-2xl p-4 border border-slate-100 dark:border-white/5 bg-white dark:bg-dark-surface hover:shadow-md transition-all',
                    isDone && 'opacity-60 hover:opacity-100',
                  )}
                >
                  {/* Top row: cover + info + avatars */}
                  <div className="flex items-start justify-between mb-3">
                    {/* Cover thumbnail */}
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={g.name}
                        className="w-12 h-12 rounded-xl object-cover shrink-0 mr-3"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0 mr-3">
                        <span className="material-icons text-primary text-2xl">groups</span>
                      </div>
                    )}

                    {/* Name + description + last active */}
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-bold text-text-dark dark:text-white text-base tracking-tight truncate">
                          {g.name}
                        </h3>
                        {recently && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"
                            style={{ boxShadow: '0 0 8px rgba(34,197,94,0.6)' }}
                          />
                        )}
                        {isDone && (
                          <span className="material-icons text-green-500 text-sm shrink-0">
                            check_circle
                          </span>
                        )}
                      </div>
                      {g.description && (
                        <p className="text-xs text-text-muted dark:text-dark-text-secondary truncate mb-0.5">
                          {g.description}
                        </p>
                      )}
                      <p className="text-xs text-text-muted dark:text-dark-text-secondary font-medium">
                        {lastActive
                          ? t('groups.lastActive').replace('{relative}', lastActive)
                          : g.created_at
                            ? `${t('groups.created')} ${new Date(g.created_at).toLocaleDateString()}`
                            : ''}
                      </p>
                    </div>

                    {/* Member avatars */}
                    <div className="flex -space-x-2 shrink-0">
                      {[...Array(Math.min(2, g.member_count ?? 0))].map((_, i) => (
                        <div
                          key={i}
                          className="h-8 w-8 rounded-full border-2 border-white dark:border-dark-bg bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary ring-1 ring-slate-100 dark:ring-dark-border"
                        >
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

                  {/* Sites count + level badge */}
                  <div className="flex justify-between items-center text-xs text-text-muted dark:text-dark-text-secondary mb-2 font-medium">
                    <span>
                      {t('groups.sitesCount')
                        .replace('{visited}', String(visited))
                        .replace('{total}', String(total || '—'))}
                    </span>
                    {level && (
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border',
                          isDone
                            ? 'text-green-600 bg-green-50 dark:bg-green-950/40 border-green-500/20'
                            : isNew
                              ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500/20'
                              : 'text-primary bg-soft-blue dark:bg-primary/20 border-primary/20',
                        )}
                      >
                        {level}
                      </span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-[3px] overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        isDone
                          ? 'bg-green-500 dark:shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                          : 'bg-primary dark:shadow-[0_0_8px_rgba(59,130,246,0.5)]',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      {user && (
        <Link
          to="/groups/new"
          className="fixed bottom-24 right-4 md:right-6 z-50 h-14 w-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary-hover active:scale-90 transition-all"
          aria-label={t('groups.createGroup')}
        >
          <span className="material-icons text-2xl">add</span>
        </Link>
      )}
    </div>
  );
}
