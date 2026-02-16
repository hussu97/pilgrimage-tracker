import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers';
import { useI18n } from '@/app/providers';
import { updateMe, updateSettings } from '@/lib/api/client';
import type { Religion } from '@/lib/types';

const RELIGIONS: Religion[] = ['islam', 'hinduism', 'christianity'];

export default function EditProfile() {
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [religions, setReligions] = useState<Religion[]>(user?.religions ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleReligion = (r: Religion) => {
    setReligions((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      await updateMe({
        display_name: displayName.trim() || user.display_name,
      });
      await updateSettings({ religions });
      await refreshUser();
      navigate('/profile');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <button
        type="button"
        onClick={() => navigate('/profile')}
        className="flex items-center gap-2 text-text-muted hover:text-primary mb-6 text-sm"
      >
        <span className="material-symbols-outlined">arrow_back</span>
        {t('common.back')}
      </button>
      <h1 className="text-xl font-bold text-text-main mb-6">{t('profile.editProfile')}</h1>

      <form onSubmit={handleSave} className="space-y-5">
        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div>
          <label className="block text-sm font-medium text-text-main mb-1">{t('auth.displayName')}</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full border border-input-border rounded-xl px-4 py-3 text-text-main bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-main mb-2">{t('settings.religionsToShow')}</label>
          <div className="space-y-2">
            {RELIGIONS.map((r) => (
              <label
                key={r}
                className="flex items-center gap-3 p-3 border border-input-border rounded-xl cursor-pointer hover:bg-soft-blue"
              >
                <input
                  type="checkbox"
                  checked={religions.includes(r)}
                  onChange={() => toggleReligion(r)}
                  className="rounded border-input-border text-primary focus:ring-primary"
                />
                <span className="text-text-main">{t(`common.${r}`)}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-1">{t('selectPath.hint')}</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="flex-1 py-3 rounded-xl border border-input-border text-text-main font-medium hover:bg-soft-blue"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
