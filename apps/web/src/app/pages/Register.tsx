import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useI18n } from '@/app/providers';
import * as api from '@/lib/api/client';

type ReligionChip = 'all' | 'islam' | 'hinduism' | 'christianity';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [selectedReligion, setSelectedReligion] = useState<ReligionChip>('all');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const religionChips: ReligionChip[] = ['all', 'islam', 'hinduism', 'christianity'];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError(t('auth.passwordsDoNotMatch')); return; }
    if (password.length < 6) { setError(t('auth.passwordMinLength')); return; }
    setSubmitting(true);
    try {
      await register(email, password, displayName.trim() || undefined);
      if (selectedReligion !== 'all') {
        await api.updateSettings({ religions: [selectedReligion] }).catch(() => {});
      }
      navigate('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.registrationFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background-light dark:bg-dark-bg flex flex-col safe-area-top safe-area-bottom">
      <div className="max-w-md w-full mx-auto px-6 pt-4 pb-10">
        {/* Back button */}
        <Link
          to="/"
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-dark-surface text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors mb-8"
          aria-label={t('common.back')}
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>

        {/* Logo icon */}
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            auto_awesome
          </span>
        </div>

        <h1 className="text-2xl font-bold text-text-dark dark:text-white mb-1">{t('auth.registerTitle')}</h1>
        <p className="text-text-muted dark:text-dark-text-secondary text-sm mb-8">{t('auth.registerSubtitle')}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder={t('auth.fullName')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-4 py-3.5 border border-input-border dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-text-main dark:text-white placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
          <input
            type="email"
            placeholder={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3.5 border border-input-border dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-text-main dark:text-white placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            required
          />
          <input
            type="password"
            placeholder={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3.5 border border-input-border dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-text-main dark:text-white placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            required
            minLength={6}
          />
          <input
            type="password"
            placeholder={t('auth.confirmPassword')}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-4 py-3.5 border border-input-border dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-text-main dark:text-white placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            required
          />

          {/* Religion chip selector */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {religionChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setSelectedReligion(chip)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                  selectedReligion === chip
                    ? 'bg-primary text-white border-primary'
                    : 'border-slate-200 dark:border-dark-border text-text-secondary dark:text-dark-text-secondary hover:border-primary hover:text-primary'
                }`}
              >
                {t(`register.religionChip.${chip}`)}
              </button>
            ))}
          </div>

          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-semibold py-4 rounded-2xl transition-all active:scale-[0.98]"
          >
            {submitting ? t('common.loading') : t('auth.registerTitle')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted dark:text-dark-text-secondary">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link to="/login" className="text-primary font-semibold hover:text-primary-hover">
            {t('auth.login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
