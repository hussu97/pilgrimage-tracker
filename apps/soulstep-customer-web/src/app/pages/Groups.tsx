'use client';

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from '@/lib/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, useI18n } from '@/app/providers';
import { useDocumentTitle } from '@/lib/hooks/useDocumentTitle';
import { cn } from '@/lib/utils/cn';
import { getGroups } from '@/lib/api/client';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import JoinJourneyModal from '@/components/groups/JoinJourneyModal';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import GroupListSkeleton from '@/components/common/skeletons/GroupListSkeleton';
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

type FilterTab = 'all' | 'active' | 'completed';

export default function Groups() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  useDocumentTitle(t('nav.groups'));
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [joinOpen, setJoinOpen] = useState(false);

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

  // Derived stats
  const totalVisited = groups.reduce((acc, g) => acc + (g.sites_visited ?? 0), 0);
  const completedCount = groups.filter(
    (g) => (g.total_sites ?? 0) > 0 && (g.sites_visited ?? 0) >= (g.total_sites ?? 0),
  ).length;
  const activeCount = groups.filter(
    (g) =>
      (g.total_sites ?? 0) > 0 &&
      (g.sites_visited ?? 0) > 0 &&
      (g.sites_visited ?? 0) < (g.total_sites ?? 0),
  ).length;

  // Calculate streak (consecutive days with activity)
  const streak = Math.min(7, groups.filter((g) => isRecentlyActive(g.last_activity)).length);

  const filteredGroups = groups.filter((g) => {
    if (filterTab === 'completed') {
      return (g.total_sites ?? 0) > 0 && (g.sites_visited ?? 0) >= (g.total_sites ?? 0);
    }
    if (filterTab === 'active') {
      return (g.total_sites ?? 0) > 0 && (g.sites_visited ?? 0) < (g.total_sites ?? 0);
    }
    return true;
  });

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: t('common.all') || 'All' },
    { key: 'active', label: t('groups.active') || 'Active' },
    { key: 'completed', label: t('common.done') || 'Completed' },
  ];

  return (
    <div className="min-h-screen bg-background-light dark:bg-dark-bg">
      <header className="sticky top-0 z-40 bg-white dark:bg-dark-surface border-b border-slate-100 dark:border-dark-border px-4 md:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-text-dark dark:text-white">
            {t('groups.myJourneys') || t('groups.myGroups')}
          </h1>
          {groups.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
              {groups.length}
            </span>
          )}
        </div>
        {user && (
          <button
            type="button"
            onClick={() => setJoinOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
          >
            <span className="material-symbols-outlined text-base">group_add</span>
            <span className="hidden sm:inline">{t('journey.joinWithCode') || 'Join'}</span>
          </button>
        )}
      </header>

      <main className="max-w-md md:max-w-4xl xl:max-w-6xl mx-auto px-4 md:px-6 py-6 pb-[var(--mobile-bottom-nav-height)]">
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

        {user && loading && groups.length === 0 && <GroupListSkeleton />}
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
          <>
            {/* Stats bar */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-3 gap-3 mb-6"
            >
              <div className="rounded-2xl bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border p-3 text-center shadow-sm">
                <p className="text-xl font-bold text-text-primary dark:text-white">
                  {totalVisited}
                </p>
                <p className="text-[10px] text-text-muted dark:text-dark-text-secondary font-medium mt-0.5">
                  {t('groups.placesVisited') || 'Sites Visited'}
                </p>
              </div>
              <div className="rounded-2xl bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border p-3 text-center shadow-sm">
                <p className="text-xl font-bold text-text-primary dark:text-white">
                  {groups.length}
                </p>
                <p className="text-[10px] text-text-muted dark:text-dark-text-secondary font-medium mt-0.5">
                  {t('groups.journeyCount') || 'Journeys'}
                </p>
              </div>
              <div className="rounded-2xl bg-white dark:bg-dark-surface border border-slate-100 dark:border-dark-border p-3 text-center shadow-sm">
                <p className="text-xl font-bold text-text-primary dark:text-white">
                  {streak > 0 ? `${streak}🔥` : completedCount}
                </p>
                <p className="text-[10px] text-text-muted dark:text-dark-text-secondary font-medium mt-0.5">
                  {streak > 0
                    ? t('groups.activeStreak') || 'Active Streak'
                    : t('groups.completed') || 'Completed'}
                </p>
              </div>
            </motion.div>

            {/* Filter tabs */}
            <div className="flex gap-1 mb-5 p-1 rounded-2xl bg-slate-100 dark:bg-dark-surface w-fit">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilterTab(tab.key)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-semibold transition-all',
                    filterTab === tab.key
                      ? 'bg-white dark:bg-dark-bg text-primary shadow-sm'
                      : 'text-text-muted dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-white',
                  )}
                >
                  {tab.label}
                  {tab.key === 'active' && activeCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                      {activeCount}
                    </span>
                  )}
                  {tab.key === 'completed' && completedCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 text-[10px] font-bold">
                      {completedCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Journey cards */}
            <AnimatePresence mode="popLayout">
              {filteredGroups.length === 0 ? (
                <motion.p
                  key="empty-filter"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-text-muted dark:text-dark-text-secondary text-sm py-6 text-center"
                >
                  {t('groups.noGroupsYet')}
                </motion.p>
              ) : (
                <div className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">
                  {filteredGroups.map((g, index) => {
                    const total = g.total_sites ?? 0;
                    const visited = g.sites_visited ?? 0;
                    const pct = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;
                    const level = progressLevel(visited, total, t);
                    const lastActive = formatRelative(g.last_activity ?? undefined, t);
                    const recently = isRecentlyActive(g.last_activity);
                    const isDone = pct >= 100 && total > 0;
                    const isNew = visited === 0;
                    const coverUrl = g.cover_image_url ? getFullImageUrl(g.cover_image_url) : null;

                    return (
                      <motion.div
                        key={g.group_code}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: index * 0.05, duration: 0.25 }}
                        layout
                      >
                        <Link
                          to={`/groups/${g.group_code}`}
                          className={cn(
                            'block rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 bg-white dark:bg-dark-surface hover:shadow-lg transition-all duration-200',
                            isDone && 'opacity-70 hover:opacity-100',
                          )}
                        >
                          {/* Cover image with gradient overlay */}
                          <div className="relative h-32 lg:h-40 bg-gradient-to-br from-primary/20 to-primary/5">
                            {coverUrl ? (
                              <>
                                <img
                                  src={coverUrl}
                                  alt={g.name}
                                  className="absolute inset-0 w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                              </>
                            ) : (
                              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                                <span
                                  className="material-symbols-outlined text-5xl text-primary/30"
                                  style={{ fontVariationSettings: "'FILL' 1" }}
                                >
                                  route
                                </span>
                              </div>
                            )}

                            {/* Badges on image */}
                            <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
                              <div className="flex items-center gap-1.5">
                                {recently && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/90 text-white text-[10px] font-bold backdrop-blur-sm">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                    Active
                                  </span>
                                )}
                                {isDone && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[10px] font-bold backdrop-blur-sm">
                                    <span className="material-symbols-outlined text-[12px]">
                                      check
                                    </span>
                                    Done
                                  </span>
                                )}
                              </div>
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-white text-[10px] font-semibold">
                                <span className="material-symbols-outlined text-[12px]">
                                  person
                                </span>
                                {g.member_count ?? 0}
                              </span>
                            </div>

                            {/* Journey name on image */}
                            {coverUrl && (
                              <div className="absolute bottom-2.5 left-3 right-3">
                                <h3 className="font-bold text-white text-sm leading-tight line-clamp-1 drop-shadow">
                                  {g.name}
                                </h3>
                              </div>
                            )}
                          </div>

                          {/* Card body */}
                          <div className="p-3.5">
                            {!coverUrl && (
                              <h3 className="font-bold text-text-dark dark:text-white text-sm mb-1 truncate">
                                {g.name}
                              </h3>
                            )}

                            {g.description && (
                              <p className="text-xs text-text-muted dark:text-dark-text-secondary truncate mb-2">
                                {g.description}
                              </p>
                            )}

                            {/* Progress bar */}
                            <div className="mb-2">
                              <div className="flex justify-between text-[10px] text-text-muted dark:text-dark-text-secondary font-medium mb-1">
                                <span>
                                  {visited}/{total || '—'} {t('groups.places') || 'places'}
                                </span>
                                {level && (
                                  <span
                                    className={cn(
                                      'px-1.5 py-0 rounded text-[9px] font-bold uppercase tracking-wider border',
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
                              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                                <motion.div
                                  className={cn(
                                    'h-full rounded-full',
                                    isDone ? 'bg-green-500' : 'bg-primary',
                                  )}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 0.6, delay: index * 0.05 + 0.2 }}
                                />
                              </div>
                            </div>

                            {/* Footer row */}
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] text-text-muted dark:text-dark-text-secondary">
                                {lastActive
                                  ? t('groups.lastActive').replace('{relative}', lastActive)
                                  : g.created_at
                                    ? `${t('groups.created')} ${new Date(g.created_at).toLocaleDateString()}`
                                    : ''}
                              </p>
                              {!isDone && visited > 0 && (
                                <span className="text-[10px] font-semibold text-primary">
                                  {t('journey.continueJourney') || 'Continue'} →
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </AnimatePresence>
          </>
        )}
      </main>

      <JoinJourneyModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}
