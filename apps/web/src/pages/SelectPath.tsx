import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { updateSettings } from '@/api/client';
import type { Religion } from '@/types';

const RELIGIONS: Religion[] = ['islam', 'hinduism', 'christianity'];

export default function SelectPath() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const [selected, setSelected] = useState<Religion[]>(user?.religions ?? []);
  const [saving, setSaving] = useState(false);

  function toggle(r: Religion) {
    setSelected((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  }

  async function handleContinue() {
    setSaving(true);
    try {
      await updateSettings({ religions: selected });
      await refreshUser();
      navigate('/home');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-text-main mb-2">{t('selectPath.title')}</h1>
      <p className="text-text-muted mb-8">{t('selectPath.subtitle')}</p>
      <div className="space-y-4">
        {RELIGIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => toggle(r)}
            className={`w-full p-4 border rounded-xl text-left flex items-center gap-4 transition-colors ${
              selected.includes(r)
                ? 'border-primary bg-primary/10'
                : 'border-input-border hover:border-primary/50'
            }`}
          >
            <span
              className={`material-symbols-outlined text-2xl ${
                r === 'islam'
                  ? 'text-emerald-600'
                  : r === 'hinduism'
                    ? 'text-orange-600'
                    : 'text-blue-600'
              }`}
            >
              {r === 'islam' ? 'mosque' : r === 'hinduism' ? 'temple_hindu' : 'church'}
            </span>
            <span className="font-medium text-text-main">{t(`common.${r}`)}</span>
            {selected.includes(r) && (
              <span className="material-symbols-outlined text-primary ml-auto">check</span>
            )}
          </button>
        ))}
      </div>
      <p className="text-sm text-text-muted mt-4 mb-6">{t('selectPath.hint')}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleContinue}
          disabled={saving}
          className="flex-1 py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-50"
        >
          {saving ? t('common.loading') : t('selectPath.continue')}
        </button>
      </div>
      <button
        type="button"
        onClick={async () => {
          setSaving(true);
          try {
            await updateSettings({ religions: [] });
            await refreshUser();
            navigate('/home');
          } finally {
            setSaving(false);
          }
        }}
        disabled={saving}
        className="block mt-4 w-full text-center text-sm text-text-muted hover:text-primary disabled:opacity-50"
      >
        {t('selectPath.skip')}
      </button>
    </div>
  );
}
