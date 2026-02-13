import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { updateMe, updateReligion } from '@/api/client';
import type { Religion } from '@/types';

export default function EditProfile() {
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [religion, setReligion] = useState<Religion | ''>(user?.religion ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      await updateMe({ display_name: displayName });
      if (religion !== '' && religion !== user.religion) {
        await updateReligion(religion as Religion);
      }
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
    <div className="max-w-md mx-auto px-5 py-6">
      <h1 className="text-xl font-bold text-text-main mb-4">{t('profile.editProfile')}</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-text-main mb-1">{t('auth.displayName')}</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-text-main bg-white dark:bg-gray-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-main mb-1">Religion</label>
          <select
            value={religion}
            onChange={(e) => setReligion(e.target.value as Religion | '')}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-text-main bg-white dark:bg-gray-800"
          >
            <option value="">{t('selectPath.skip')}</option>
            <option value="islam">{t('common.islam')}</option>
            <option value="hinduism">{t('common.hinduism')}</option>
            <option value="christianity">{t('common.christianity')}</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => navigate(-1)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-text-main font-medium">
          {t('common.cancel')}
        </button>
        <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-50">
          {saving ? t('common.loading') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
