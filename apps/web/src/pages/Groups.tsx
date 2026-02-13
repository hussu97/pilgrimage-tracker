import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getGroups } from '@/api/client';
import type { Group } from '@/types';

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchGroups = useCallback(() => {
    setLoading(true);
    setError('');
    getGroups()
      .then(setGroups)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    getGroups()
      .then((data) => { if (!cancelled) setGroups(data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-primary font-medium uppercase tracking-wide mb-1">Pilgrimage</p>
          <h1 className="text-2xl font-semibold text-text-main">My Groups</h1>
        </div>
        <Link
          to="/groups/new"
          className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-white shadow-lg"
          aria-label="Create group"
        >
          <span className="material-icons">add</span>
        </Link>
      </header>

      {loading && <p className="text-text-muted">Loading groups...</p>}
      {error && (
        <div className="mb-4">
          <p className="text-red-600 mb-2">{error}</p>
          <button type="button" onClick={fetchGroups} className="text-primary font-medium">Retry</button>
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100">
          <span className="material-symbols-outlined text-5xl text-gray-300 mb-3">groups</span>
          <p className="text-text-muted mb-2">No groups yet</p>
          <p className="text-sm text-text-muted mb-4">Create a group to track pilgrimages with friends.</p>
          <Link to="/groups/new" className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium">
            Create a group
          </Link>
        </div>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="space-y-3">
          {groups.map((g) => (
            <Link
              key={g.group_code}
              to={`/groups/${g.group_code}`}
              className="block p-4 bg-white rounded-2xl border border-gray-200 hover:shadow-md transition-shadow"
            >
              <h3 className="font-bold text-text-main">{g.name}</h3>
              {g.description && <p className="text-sm text-text-muted mt-1 line-clamp-2">{g.description}</p>}
              <p className="text-xs text-text-muted mt-2">{g.member_count ?? 0} members</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
