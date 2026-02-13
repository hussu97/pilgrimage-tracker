import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { getGroup, getGroupLeaderboard, getGroupActivity } from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import ErrorState from '@/components/ErrorState';
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
      <div className="p-6 text-center">
        <p className="text-text-muted">Missing group.</p>
        <button type="button" onClick={() => navigate('/groups')} className="text-primary mt-2">
          Back to Groups
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
    <div className="max-w-md mx-auto px-4 py-6 pb-8">
      <button
        type="button"
        onClick={() => navigate('/groups')}
        aria-label={t('common.back')}
        className="flex items-center gap-2 text-text-muted hover:text-primary mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
      >
        <span className="material-symbols-outlined" aria-hidden>arrow_back</span>
        Back
      </button>

      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-main">{group.name}</h1>
            <p className="text-text-muted text-sm mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">person</span>
              {group.member_count ?? 0} {t('groups.members')}
            </p>
          </div>
          {inviteUrl && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleShareInvite}
                className="inline-flex items-center gap-2 py-2 px-4 rounded-xl border border-input-border text-text-main font-medium text-sm hover:bg-soft-blue"
              >
                <span className="material-symbols-outlined text-lg">share</span>
                Share
              </button>
              <button
                type="button"
                onClick={copyInvite}
                className="inline-flex items-center gap-2 py-2 px-4 rounded-xl border border-primary text-primary font-medium text-sm hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-lg">link</span>
                {inviteCopied ? 'Copied!' : 'Invite'}
              </button>
            </div>
          )}
        </div>
        {group.description && (
          <p className="text-text-muted text-sm mt-3">{group.description}</p>
        )}
      </header>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-text-main mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">emoji_events</span>
          {t('groups.leaderboard')}
        </h2>

        {topThree.length > 0 && (
          <div className="flex justify-center items-end gap-2 mb-6">
            {topThree[1] && (
              <div className="flex flex-col items-center flex-1 order-1">
                <div className="w-12 h-12 rounded-full bg-amber-200 dark:bg-amber-900/50 flex items-center justify-center text-amber-700 dark:text-amber-400 font-bold text-lg mb-2">
                  {(topThree[1].display_name || '?').charAt(0)}
                </div>
                <p className="text-sm font-medium text-text-main truncate w-full text-center">{topThree[1].display_name}</p>
                <p className="text-xs text-text-muted">{topThree[1].places_visited} places</p>
                <div className="mt-2 h-14 w-full max-w-[80px] rounded-t-lg bg-gray-200 dark:bg-gray-600 flex items-end justify-center pb-1">
                  <span className="text-2xl font-bold text-text-muted">2</span>
                </div>
              </div>
            )}
            {topThree[0] && (
              <div className="flex flex-col items-center flex-1 order-0">
                <div className="w-14 h-14 rounded-full bg-amber-300 dark:bg-amber-800/60 flex items-center justify-center text-amber-800 dark:text-amber-300 font-bold text-xl mb-2">
                  {(topThree[0].display_name || '?').charAt(0)}
                </div>
                <p className="text-sm font-medium text-text-main truncate w-full text-center">{topThree[0].display_name}</p>
                <p className="text-xs text-text-muted">{topThree[0].places_visited} places</p>
                <div className="mt-2 h-20 w-full max-w-[80px] rounded-t-lg bg-primary/30 flex items-end justify-center pb-1">
                  <span className="text-2xl font-bold text-primary">1</span>
                </div>
              </div>
            )}
            {topThree[2] && (
              <div className="flex flex-col items-center flex-1 order-2">
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-500 font-bold text-lg mb-2">
                  {(topThree[2].display_name || '?').charAt(0)}
                </div>
                <p className="text-sm font-medium text-text-main truncate w-full text-center">{topThree[2].display_name}</p>
                <p className="text-xs text-text-muted">{topThree[2].places_visited} places</p>
                <div className="mt-2 h-10 w-full max-w-[80px] rounded-t-lg bg-gray-200 dark:bg-gray-600 flex items-end justify-center pb-1">
                  <span className="text-2xl font-bold text-text-muted">3</span>
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
            {showFullLeaderboard ? 'Show less' : 'View full leaderboard'}
          </button>
        )}

        {displayLeaderboard.length > 0 && (
          <ul className="space-y-2">
            {displayLeaderboard.map((entry) => (
              <li
                key={entry.user_code}
                className="flex items-center gap-3 p-3 rounded-xl border border-input-border bg-surface"
              >
                <span className="text-sm font-medium text-text-muted w-6">#{entry.rank}</span>
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold shrink-0">
                  {(entry.display_name || '?').charAt(0)}
                </div>
                <span className="font-medium text-text-main flex-1 truncate">{entry.display_name}</span>
                <span className="text-sm text-text-muted">{entry.places_visited} places</span>
              </li>
            ))}
          </ul>
        )}
        {leaderboard.length === 0 && (
          <p className="text-text-muted text-sm py-4">No leaderboard data yet.</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">history</span>
          Recently visited
        </h2>
        {activity.length === 0 ? (
          <p className="text-text-muted text-sm py-4">No recent activity.</p>
        ) : (
          <ul className="space-y-3">
            {activity.map((item, i) => (
              <li key={`${item.user_code}-${item.place_code}-${item.checked_in_at}-${i}`}>
                <Link
                  to={`/places/${item.place_code}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-input-border bg-surface hover:bg-soft-blue"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold shrink-0">
                    {(item.display_name || '?').charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-main">
                      <span className="font-medium">{item.display_name}</span>
                      {' checked in at '}
                      <span className="font-medium">{item.place_name}</span>
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {item.checked_in_at ? new Date(item.checked_in_at).toLocaleString() : ''}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-text-muted shrink-0">chevron_right</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
