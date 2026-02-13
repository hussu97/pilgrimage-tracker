import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getGroup, getGroupLeaderboard, getGroupActivity } from '@/api/client';
import type { Group, LeaderboardEntry, ActivityItem } from '@/types';

export default function GroupDetail() {
  const { groupCode } = useParams<{ groupCode: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!groupCode) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getGroup(groupCode),
      getGroupLeaderboard(groupCode),
      getGroupActivity(groupCode, 15),
    ])
      .then(([g, lb, act]) => {
        if (!cancelled) {
          setGroup(g);
          setLeaderboard(lb);
          setActivity(act);
        }
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groupCode]);

  const copyInviteLink = () => {
    if (!group) return;
    const url = `${window.location.origin}/join?code=${group.invite_code}`;
    navigator.clipboard.writeText(url);
  };

  if (loading) return <div className="max-w-md mx-auto px-5 py-8 text-text-muted">Loading...</div>;
  if (error || !group) return <div className="max-w-md mx-auto px-5 py-8 text-red-600">{error || 'Group not found'}</div>;

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3, 10);

  return (
    <div className="max-w-md mx-auto px-5 py-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-gray-100" aria-label="Back">
          <span className="material-icons">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-text-main">{group.name}</h1>
          <p className="text-sm text-text-muted">{group.member_count ?? 0} members</p>
        </div>
        <button type="button" onClick={copyInviteLink} className="py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium">
          Invite
        </button>
      </div>

      {group.description && <p className="text-sm text-text-muted mb-6">{group.description}</p>}

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-text-main mb-3">Leaderboard</h2>
        {top3.length > 0 ? (
          <>
            <div className="flex justify-center items-end gap-2 mb-4">
              {top3[1] && (
                <div className="flex flex-col items-center flex-1">
                  <p className="text-2xl font-bold text-gray-400">2</p>
                  <p className="text-sm font-medium text-text-main truncate w-full text-center">{top3[1].display_name}</p>
                  <p className="text-xs text-primary font-bold">{top3[1].places_visited} places</p>
                </div>
              )}
              {top3[0] && (
                <div className="flex flex-col items-center flex-1">
                  <p className="text-2xl font-bold text-yellow-500">1</p>
                  <p className="text-sm font-medium text-text-main truncate w-full text-center">{top3[0].display_name}</p>
                  <p className="text-xs text-primary font-bold">{top3[0].places_visited} places</p>
                </div>
              )}
              {top3[2] && (
                <div className="flex flex-col items-center flex-1">
                  <p className="text-2xl font-bold text-amber-600">3</p>
                  <p className="text-sm font-medium text-text-main truncate w-full text-center">{top3[2].display_name}</p>
                  <p className="text-xs text-primary font-bold">{top3[2].places_visited} places</p>
                </div>
              )}
            </div>
            <ul className="space-y-2">
              {rest.map((e, i) => (
                <li key={e.user_code} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm font-bold text-gray-400 w-6">{e.rank}</span>
                  <span className="flex-1 font-medium text-text-main">{e.display_name}</span>
                  <span className="text-sm text-primary font-bold">{e.places_visited} places</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-text-muted py-4">No check-ins yet. Check in at places to appear on the leaderboard.</p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-main mb-3">Recently visited</h2>
        {activity.length > 0 ? (
          <ul className="space-y-3">
            {activity.map((a, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="material-symbols-outlined text-primary text-xl">location_on</span>
                <div>
                  <p className="text-text-main"><strong>{a.display_name}</strong> checked in at <Link to={`/places/${a.place_code}`} className="text-primary font-medium">{a.place_name}</Link></p>
                  <p className="text-xs text-text-muted">{new Date(a.checked_in_at).toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted py-4">No recent activity.</p>
        )}
      </section>
    </div>
  );
}
