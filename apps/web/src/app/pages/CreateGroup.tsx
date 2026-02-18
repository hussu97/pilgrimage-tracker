import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { createGroup } from '@/lib/api/client';
import { shareUrl } from '@/lib/share';

export default function CreateGroup() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [groupCode, setGroupCode] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const g = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        is_private: isPrivate,
      });
      setInviteCode(g.invite_code);
      setGroupCode(g.group_code);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoToGroup = () => {
    if (groupCode) navigate(`/groups/${groupCode}`);
  };

  if (inviteCode && groupCode) {
    const inviteUrlFull = `${window.location.origin}/join?code=${inviteCode}`;
    return (
      <div className="max-w-md mx-auto px-4 py-8 dark:bg-dark-bg min-h-screen">
        <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-3xl text-primary">check_circle</span>
        </div>
        <h2 className="text-xl font-semibold text-text-main dark:text-white text-center mb-2">
          {t('groups.groupCreated')}
        </h2>
        <p className="text-text-muted dark:text-dark-text-secondary text-sm text-center mb-6">
          {t('groups.shareInviteLink')}
        </p>
        <div className="flex gap-2 mb-4">
          <input
            readOnly
            value={inviteUrlFull}
            className="flex-1 text-sm border border-input-border dark:border-dark-border rounded-xl px-4 py-3 bg-background-light dark:bg-dark-surface text-text-main dark:text-white"
          />
          <button
            type="button"
            onClick={() => shareUrl('Join our group', inviteUrlFull)}
            className="px-4 py-3 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium shrink-0 hover:bg-soft-blue dark:hover:bg-dark-surface inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined">share</span>
            {t('common.share')}
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(inviteUrlFull)}
            className="px-4 py-3 rounded-xl bg-primary text-white font-medium shrink-0 hover:bg-primary-hover"
          >
            {t('common.copy')}
          </button>
        </div>
        <button
          type="button"
          onClick={handleGoToGroup}
          className="w-full py-3 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium hover:bg-soft-blue dark:hover:bg-dark-surface"
        >
          {t('groups.goToGroup')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 dark:bg-dark-bg min-h-screen">
      <h1 className="text-xl font-bold text-text-main dark:text-white mb-6">
        {t('groups.createGroup')}
      </h1>
      {error && <p className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-main dark:text-white mb-1">
            {t('groups.nameLabel')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border border-input-border dark:border-dark-border rounded-xl px-4 py-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-main dark:text-white mb-1">
            {t('groups.descriptionLabel')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border border-input-border dark:border-dark-border rounded-xl px-4 py-3 text-text-main dark:text-white bg-surface dark:bg-dark-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <label className="flex items-center gap-3 p-3 border border-input-border dark:border-dark-border rounded-xl cursor-pointer hover:bg-soft-blue dark:hover:bg-dark-surface">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="rounded border-input-border text-primary"
          />
          <span className="text-text-main dark:text-white text-sm">{t('groups.privateGroup')}</span>
        </label>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 py-3 rounded-xl border border-input-border dark:border-dark-border text-text-main dark:text-white font-medium"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
