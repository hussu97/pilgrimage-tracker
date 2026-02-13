import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { getGroups } from '@/lib/api/client';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import type { Group } from '@/lib/types';

export default function Groups() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchGroups = useCallback(() => {
    setLoading(true);
    setError('');
    getGroups()
      .then(setGroups)
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  return (
    <div className="max-w-md md:max-w-4xl mx-auto px-4 py-6 pb-24 md:pb-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-primary font-medium uppercase tracking-wide mb-1">{t('groups.title')}</p>
          <h1 className="text-2xl font-semibold text-text-main">My Groups</h1>
        </div>
        <Link
          to="/groups/new"
          className="inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover shadow-sm shrink-0"
        >
          <span className="material-symbols-outlined">add</span>
          {t('groups.createGroup')}
        </Link>
      </header>

      {loading && <p className="text-text-muted">{t('common.loading')}</p>}
      {error && (
        <ErrorState message={error} onRetry={fetchGroups} retryLabel={t('common.retry')} />
      )}
      {!loading && !error && groups.length === 0 && (
        <EmptyState
          icon="groups"
          title="No groups yet"
          description="Create a group or join one with an invite link."
          action={
            <Link to="/groups/new" className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              {t('groups.createGroup')}
            </Link>
          }
        />
      )}
      {!loading && !error && groups.length > 0 && (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.group_code}>
              <Link
                to={`/groups/${g.group_code}`}
                className="block p-4 rounded-xl border border-input-border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-text-main truncate">{g.name}</h2>
                    {g.description ? (
                      <p className="text-sm text-text-muted mt-1 line-clamp-2">{g.description}</p>
                    ) : null}
                    <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">person</span>
                        {g.member_count ?? 0} {t('groups.members')}
                      </span>
                      {g.created_at && (
                        <span>
                          Created {new Date(g.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-text-muted shrink-0">chevron_right</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
