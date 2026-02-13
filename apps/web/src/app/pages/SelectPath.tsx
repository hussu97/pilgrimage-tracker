import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers';
import { useI18n } from '@/app/providers';
import { updateSettings } from '@/lib/api/client';
import type { Religion } from '@/lib/types';

const RELIGIONS: { code: Religion; labelKey: string }[] = [
  { code: 'islam', labelKey: 'common.islam' },
  { code: 'hinduism', labelKey: 'common.hinduism' },
  { code: 'christianity', labelKey: 'common.christianity' },
];

export default function SelectPath() {
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Religion[]>(user?.religions ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function toggle(religion: Religion) {
    setSelected((prev) =>
      prev.includes(religion) ? prev.filter((r) => r !== religion) : [...prev, religion]
    );
  }

  async function handleContinue() {
    setError('');
    setLoading(true);
    try {
      await updateSettings({ religions: selected });
      await refreshUser();
      navigate('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    navigate('/home');
  }

  return (
    <div className="max-w-md mx-auto px-6 py-8 safe-area-top safe-area-bottom">
      <h1 className="text-3xl font-semibold text-text-main mb-3">{t('selectPath.title')}</h1>
      <p className="text-text-muted mb-6">{t('selectPath.subtitle')}</p>

      <div className="space-y-3 mb-8">
        {RELIGIONS.map(({ code, labelKey }) => (
          <button
            key={code}
            type="button"
            onClick={() => toggle(code)}
            className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border-2 text-left transition-colors ${
              selected.includes(code)
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-input-border bg-background-light text-text-main hover:border-primary/50'
            }`}
          >
            <span className="font-medium">{t(labelKey)}</span>
            {selected.includes(code) && (
              <span className="material-symbols-outlined text-primary">check_circle</span>
            )}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-muted mb-6">{t('selectPath.hint')}</p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleContinue}
          disabled={loading}
          className="w-full bg-primary hover:bg-primary-hover text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('selectPath.continue')}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          className="w-full py-3 rounded-xl border border-input-border text-text-muted hover:text-text-main hover:border-primary/50 transition-colors"
        >
          {t('selectPath.skip')}
        </button>
      </div>
    </div>
  );
}
