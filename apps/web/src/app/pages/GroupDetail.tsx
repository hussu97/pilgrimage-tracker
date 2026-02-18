import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { getGroup, getGroupLeaderboard, getGroupActivity } from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import ErrorState from '@/components/common/ErrorState';
import type { Group, LeaderboardEntry, ActivityItem } from '@/lib/types';

export default function GroupDetail() {
  const { groupCode } = useParams<{ groupCode: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [group, setGroup] = useState<Group | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const fetchData = useCallback(async () => {
    if (!groupCode) return;
    setLoading(true);
    setError('');
    try {
      const [g, lb, act] = await Promise.all([
        getGroup(groupCode),
        getGroupLeaderboard(groupCode),
        getGroupActivity(groupCode, 20),
      ]);
      setGroup(g);
      setLeaderboard(Array.isArray(lb) ? lb : []);
      setActivity(Array.isArray(act) ? act : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [groupCode, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const inviteUrl = group?.invite_code
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join?code=${group.invite_code}`
    : '';

  const copyInvite = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }
  };

  const handleShareInvite = async () => {
    if (inviteUrl) await shareUrl(group?.name ?? 'Group invite', inviteUrl);
  };

  if (!groupCode) {
    return (
      <div className="p-6 text-center dark:bg-dark-bg min-h-screen">
        <p className="text-text-muted dark:text-dark-text-secondary">{t('groups.missingGroup')}</p>
        <button type="button" onClick={() => navigate('/groups')} className="text-primary mt-2">
          {t('groups.title')}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <p className="text-text-muted">{t('common.loading')}</p>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="max-w-md md:max-w-2xl mx-auto px-4 py-8">
        <ErrorState
          message={error ?? t('groups.notFound')}
          onRetry={fetchData}
          retryLabel={t('common.retry')}
          action={
            <button
              type="button"
              onClick={() => navigate('/groups')}
              className="px-4 py-2 rounded-xl border border-input-border text-text-main font-medium hover:bg-soft-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {t('nav.groups')}
            </button>
          }
        />
      </div>
    );
  }

  const topThree = leaderboard.slice(0, 3);
  const restLeaderboard = leaderboard.slice(3);
  const displayLeaderboard = showFullLeaderboard ? leaderboard : restLeaderboard;

  return (
    <div className="max-w-md mx-auto px-4 py-6 pb-8 dark:bg-dark-bg min-h-screen">
      <button
        type="button"
        onClick={() => navigate('/groups')}
        aria-label={t('common.back')}
        className="flex items-center gap-2 text-text-muted dark:text-dark-text-secondary hover:text-primary mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
      >
        <span className="material-symbols-outlined" aria-hidden>
          arrow_back
        </span>
        {t('common.back')}
      </button>

      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-main dark:text-white">{group.name}</h1>
            <p className="text-text-muted dark:text-dark-text-secondary text-sm mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">person</span>
              {group.member_count ?? 0} {t('groups.members')}
            </p>
          </div>
          {inviteUrl && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleShareInvite}
                className="inline-flex items-center gap-2 py-2 px-4 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium text-sm hover:bg-soft-blue dark:hover:bg-dark-surface"
              >
                <span className="material-symbols-outlined text-lg">share</span>
                {t('common.share')}
              </button>
              <button
                type="button"
                onClick={copyInvite}
                className="inline-flex items-center gap-2 py-2 px-4 rounded-xl border border-primary text-primary font-medium text-sm hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-lg">link</span>
                {inviteCopied ? t('common.copied') : t('groups.invite')}
              </button>
            </div>
          )}
        </div>
        {group.description && <p className="text-text-muted text-sm mt-3">{group.description}</p>}
      </header>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-text-main mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">emoji_events</span>
          {t('groups.leaderboard')}
        </h2>

        {topThree.length > 0 && (
          <div className="flex justify-center items-end gap-3 mb-8 pt-8 px-2">
            {/* 2nd Place */}
            {topThree[1] && (
              <div className="flex flex-col items-center flex-1 animate-in slide-in-from-bottom-8 duration-500 delay-150">
                <div className="relative mb-3">
                  <div className="w-14 h-14 rounded-full border-2 border-slate-200 p-0.5 bg-white shadow-soft">
                    <div className="w-full h-full rounded-full bg-slate-50 flex items-center justify-center text-slate-700 font-bold text-lg">
                      {(topThree[1].display_name || '?').charAt(0)}
                    </div>
                  </div>
                  <div className="absolute -top-2 -right-1 w-6 h-6 rounded-full bg-slate-400 border-2 border-white flex items-center justify-center text-white scale-90">
                    <span className="text-[10px] font-black">2</span>
                  </div>
                </div>
                <p className="text-xs font-bold text-slate-700 truncate w-full text-center mb-0.5">
                  {topThree[1].display_name}
                </p>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter">
                  {topThree[1].places_visited} {t('groups.places')}
                </p>
                <div className="mt-3 h-16 w-full max-w-[80px] rounded-t-2xl bg-gradient-to-b from-slate-100 to-slate-50 border-x border-t border-slate-100 flex items-center justify-center shadow-inner">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                </div>
              </div>
            )}

            {/* 1st Place */}
            {topThree[0] && (
              <div className="flex flex-col items-center flex-1 z-10 animate-in slide-in-from-bottom-12 duration-700">
                <div className="relative mb-4">
                  <div className="w-20 h-20 rounded-full border-[3px] border-amber-400 p-1 bg-white shadow-lg shadow-amber-100">
                    <div className="w-full h-full rounded-full bg-amber-50 flex items-center justify-center text-amber-800 font-black text-2xl">
                      {(topThree[0].display_name || '?').charAt(0)}
                    </div>
                  </div>
                  <div className="absolute -top-3 -right-1 w-8 h-8 rounded-full bg-amber-500 border-[3px] border-white flex items-center justify-center text-white shadow-md">
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      emoji_events
                    </span>
                  </div>
                </div>
                <p className="text-sm font-black text-slate-800 truncate w-full text-center mb-0.5">
                  {topThree[0].display_name}
                </p>
                <p className="text-[11px] font-bold text-amber-600 uppercase tracking-tight">
                  {topThree[0].places_visited} {t('groups.places')}
                </p>
                <div className="mt-3 h-24 w-full max-w-[90px] rounded-t-2xl bg-gradient-to-b from-amber-100 to-amber-50 border-x border-t border-amber-100 flex items-center justify-center shadow-inner">
                  <div className="w-2 h-2 rounded-full bg-amber-300" />
                </div>
              </div>
            )}

            {/* 3rd Place */}
            {topThree[2] && (
              <div className="flex flex-col items-center flex-1 animate-in slide-in-from-bottom-6 duration-500 delay-300">
                <div className="relative mb-3">
                  <div className="w-14 h-14 rounded-full border-2 border-orange-200 p-0.5 bg-white shadow-soft">
                    <div className="w-full h-full rounded-full bg-orange-50 flex items-center justify-center text-orange-700 font-bold text-lg">
                      {(topThree[2].display_name || '?').charAt(0)}
                    </div>
                  </div>
                  <div className="absolute -top-2 -right-1 w-6 h-6 rounded-full bg-orange-400 border-2 border-white flex items-center justify-center text-white scale-90">
                    <span className="text-[10px] font-black">3</span>
                  </div>
                </div>
                <p className="text-xs font-bold text-slate-700 truncate w-full text-center mb-0.5">
                  {topThree[2].display_name}
                </p>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter">
                  {topThree[2].places_visited} {t('groups.places')}
                </p>
                <div className="mt-3 h-12 w-full max-w-[80px] rounded-t-2xl bg-gradient-to-b from-orange-100 to-orange-50 border-x border-t border-orange-100 flex items-center justify-center shadow-inner">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-200" />
                </div>
              </div>
            )}
          </div>
        )}

        {leaderboard.length > 3 && (
          <button
            type="button"
            onClick={() => setShowFullLeaderboard((v) => !v)}
            className="text-primary font-medium text-sm mb-4"
          >
            {showFullLeaderboard ? t('common.showLess') : t('groups.viewFullLeaderboard')}
          </button>
        )}

        {displayLeaderboard.length > 0 && (
          <ul className="space-y-2">
            {displayLeaderboard.map((entry) => (
              <li
                key={entry.user_code}
                className="flex items-center gap-3 p-3 rounded-xl border border-input-border dark:border-dark-border bg-surface dark:bg-dark-surface"
              >
                <span className="text-sm font-medium text-text-muted dark:text-dark-text-secondary w-6">
                  #{entry.rank}
                </span>
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold shrink-0">
                  {(entry.display_name || '?').charAt(0)}
                </div>
                <span className="font-medium text-text-main dark:text-white flex-1 truncate">
                  {entry.display_name}
                </span>
                <span className="text-sm text-text-muted dark:text-dark-text-secondary">
                  {entry.places_visited} {t('groups.places')}
                </span>
              </li>
            ))}
          </ul>
        )}
        {leaderboard.length === 0 && (
          <p className="text-text-muted dark:text-dark-text-secondary text-sm py-4">
            {t('groups.noLeaderboardData')}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-text-main dark:text-white mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">history</span>
          {t('groups.recentlyVisited')}
        </h2>
        {activity.length === 0 ? (
          <p className="text-text-muted dark:text-dark-text-secondary text-sm py-4">
            {t('groups.noRecentActivity')}
          </p>
        ) : (
          <ul className="space-y-4">
            {activity.map((item, i) => (
              <li
                key={`${item.user_code}-${item.place_code}-${item.checked_in_at}-${i}`}
                className="animate-in fade-in slide-in-from-left duration-300"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <Link
                  to={`/places/${item.place_code}`}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface shadow-subtle hover:bg-slate-50 dark:hover:bg-dark-surface/80 transition-all group"
                >
                  <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-dark-text-secondary font-bold shrink-0 border border-white dark:border-dark-border group-hover:scale-110 transition-transform">
                    {(item.display_name || '?').charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {item.display_name}
                      </span>{' '}
                      {t('groups.checkedInAt')}{' '}
                    </p>
                    <p className="font-bold text-primary text-sm truncate">{item.place_name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="material-symbols-outlined text-[12px] text-slate-400">
                        schedule
                      </span>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {item.checked_in_at
                          ? new Date(item.checked_in_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors">
                    arrow_forward
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
