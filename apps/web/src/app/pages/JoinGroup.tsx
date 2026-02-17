import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { getGroupByInviteCode, joinGroupByCode } from '@/lib/api/client';

export default function JoinGroup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const code = searchParams.get('code')?.trim() ?? '';
  const [groupName, setGroupName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) {
      setPreviewLoading(false);
      return;
    }
    getGroupByInviteCode(code)
      .then((res) => setGroupName(res.name))
      .catch(() => setGroupName(null))
      .finally(() => setPreviewLoading(false));
  }, [code]);

  const handleJoin = async () => {
    if (!code) {
      setError(t('errors.missingInviteCode'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { group_code } = await joinGroupByCode(code);
      navigate(`/groups/${group_code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  if (previewLoading && code) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center dark:bg-dark-bg min-h-screen">
        <p className="text-text-muted dark:text-dark-text-secondary">{t('common.loading')}</p>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center dark:bg-dark-bg min-h-screen">
        <span className="material-symbols-outlined text-5xl text-text-muted dark:text-dark-text-secondary mb-4 block">link_off</span>
        <h1 className="text-xl font-semibold text-text-main dark:text-white mb-2">{t('groups.noInviteCode')}</h1>
        <p className="text-text-muted dark:text-dark-text-secondary text-sm mb-6">
          {t('groups.inviteCodeHint')}
        </p>
        <button
          type="button"
          onClick={() => navigate('/groups')}
          className="px-4 py-2 rounded-xl bg-primary text-white font-medium"
        >
          {t('groups.title')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 dark:bg-dark-bg min-h-screen">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-3xl text-primary">groups</span>
        </div>
        <h1 className="text-xl font-semibold text-text-main dark:text-white mb-2">{t('groups.joinGroup')}</h1>
        {groupName ? (
          <p className="text-text-muted dark:text-dark-text-secondary text-sm">{t('groups.invitedToJoin')} <strong className="text-text-main dark:text-white">{groupName}</strong></p>
        ) : (
          <p className="text-text-muted dark:text-dark-text-secondary text-sm">{t('groups.joinWithCode')}</p>
        )}
      </div>

      {error && <p className="text-red-600 dark:text-red-400 text-sm mb-4 text-center">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => navigate('/groups')}
          className="flex-1 py-3 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={handleJoin}
          disabled={loading}
          className="flex-1 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('groups.join')}
        </button>
      </div>
    </div>
  );
}
