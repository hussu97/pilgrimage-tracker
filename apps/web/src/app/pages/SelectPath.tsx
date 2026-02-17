import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers';
import { useI18n } from '@/app/providers';
import { updateSettings } from '@/lib/api/client';
import type { Religion } from '@/lib/types';

const RELIGIONS: { code: Religion; labelKey: string; icon: string; hoverClass: string }[] = [
  { code: 'islam', labelKey: 'common.islam', icon: 'mosque', hoverClass: 'group-hover:border-emerald-100 group-hover:shadow-emerald-100/40 group-hover:text-emerald-700' },
  { code: 'hinduism', labelKey: 'common.hinduism', icon: 'temple_hindu', hoverClass: 'group-hover:border-orange-100 group-hover:shadow-orange-100/40 group-hover:text-orange-700' },
  { code: 'christianity', labelKey: 'common.christianity', icon: 'church', hoverClass: 'group-hover:border-blue-100 group-hover:shadow-blue-100/40 group-hover:text-blue-700' },
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
    <div
      className="min-h-screen flex flex-col items-center antialiased font-sans bg-gradient-to-b from-[#F0F5FA] to-[#E6EEF5] dark:bg-none dark:bg-dark-bg"
    >
      <div className="w-full max-w-md flex flex-col flex-1 px-8 py-10 mx-auto">
        <header className="mt-14 mb-12 text-center">
          <h1 className="text-[32px] font-semibold tracking-tight mb-3 text-slate-800 dark:text-white">
            {t('selectPath.title')}
          </h1>
          <p className="text-slate-500 dark:text-dark-text-secondary text-base leading-relaxed max-w-[280px] mx-auto font-normal tracking-wide">
            {t('selectPath.subtitle')}
          </p>
        </header>

        <main className="flex-1 flex flex-col items-center justify-start gap-10">
          {RELIGIONS.map(({ code, labelKey, icon, hoverClass }) => {
            const isSelected = selected.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggle(code)}
                className={`faith-btn group flex flex-col items-center gap-5 w-full transition-transform duration-300 active:scale-[0.96] ${
                  isSelected ? 'ring-2 ring-primary ring-offset-2 rounded-full' : ''
                }`}
              >
                <div
                  className={`w-36 h-36 rounded-full bg-white dark:bg-dark-surface shadow-elevated flex items-center justify-center border-[1.5px] border-white dark:border-dark-border transition-all duration-300 relative overflow-hidden ${hoverClass}`}
                >
                  <div className="absolute inset-0 bg-transparent group-hover:bg-opacity-30 transition-colors duration-300" />
                  <span
                    className={`material-symbols-outlined text-[64px] font-light relative z-10 transition-colors duration-300 ${
                      isSelected ? 'text-primary' : 'text-slate-700'
                    } ${hoverClass}`}
                    style={{ fontVariationSettings: "'wght' 200" }}
                  >
                    {icon}
                  </span>
                </div>
                <span className="text-lg font-medium text-slate-700 dark:text-dark-text-secondary tracking-tight group-hover:transition-colors group-focus:text-slate-900">
                  {t(labelKey)}
                </span>
              </button>
            );
          })}
        </main>

        <footer className="mt-auto pb-8 flex flex-col items-center gap-5">
          {error && (
            <p className="text-red-600 text-sm text-center" role="alert">
              {error}
            </p>
          )}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={handleContinue}
              disabled={loading}
              className="w-full max-w-[280px] bg-primary hover:bg-primary-dark text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('selectPath.continue')}
            </button>
          )}
          {/* "View More Faiths" button removed - only 3 religions currently supported */}
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm font-normal text-slate-400 dark:text-dark-text-secondary hover:text-slate-600 dark:hover:text-white transition-colors"
          >
            {t('selectPath.skip')}
          </button>
        </footer>
      </div>
    </div>
  );
}
