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
        await api.updateSettings({ religions: [selectedReligion] }).catch(() => { });
      }
      navigate('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.registrationFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg flex flex-col relative overflow-hidden">
      {/* Background Gradient Panel */}
      <div className="absolute top-0 left-0 w-full h-80 bg-gradient-to-b from-blue-50 to-transparent dark:from-primary/5 dark:to-transparent pointer-events-none z-0" />

      <div className="relative z-10 max-w-sm w-full mx-auto px-8 pt-12 flex-1 flex flex-col">
        {/* Back button */}
        <Link
          to="/login"
          className="inline-flex items-center gap-1 text-slate-400 dark:text-dark-text-secondary hover:text-primary transition-colors mb-8 text-sm font-medium"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
        </Link>

        {/* Logo icon */}
        <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200 dark:shadow-none">
          <span className="material-symbols-outlined text-white text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            auto_awesome
          </span>
        </div>

        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight mb-2">
          {t('auth.registerTitle')}
        </h1>
        <p className="text-slate-500 dark:text-dark-text-secondary font-medium mb-10">
          {t('auth.registerSubtitle')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-2 ml-1">
              {t('auth.fullName')}
            </label>
            <input
              type="text"
              placeholder="John Doe"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-5 py-4 border border-slate-200 dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-slate-800 dark:text-white placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-primary/10 focus:border-primary transition-all outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-2 ml-1">
              {t('auth.email')}
            </label>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-4 border border-slate-200 dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-slate-800 dark:text-white placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-primary/10 focus:border-primary transition-all outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-2 ml-1">
              {t('auth.password')}
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-4 border border-slate-200 dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-slate-800 dark:text-white placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-primary/10 focus:border-primary transition-all outline-none"
              required
              minLength={6}
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 ml-1">{t('auth.passwordMinLength')}</p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-2 ml-1">
              {t('auth.confirmPassword')}
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-5 py-4 border border-slate-200 dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-slate-800 dark:text-white placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-blue-50 dark:focus:ring-primary/10 focus:border-primary transition-all outline-none"
              required
            />
          </div>

          {/* Religion chip selector */}
          <div className="pt-2">
            <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-3 ml-1">
              {t('profile.pilgrimagePath')}
            </label>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {religionChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setSelectedReligion(chip)}
                  className={`whitespace-nowrap px-5 py-2.5 rounded-full text-xs font-bold border transition-all ${selectedReligion === chip
                      ? 'bg-primary text-white border-primary shadow-md shadow-blue-100 dark:shadow-none'
                      : 'border-slate-200 dark:border-dark-border text-slate-500 dark:text-dark-text-secondary hover:border-primary hover:text-primary bg-white dark:bg-dark-surface'
                    }`}
                >
                  {t(`register.religionChip.${chip}`)}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm font-medium ml-1">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary hover:bg-blue-600 disabled:opacity-60 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-100 dark:shadow-none transition-all active:scale-[0.98] mt-4"
          >
            {submitting ? t('common.loading') : t('auth.registerTitle')}
          </button>
        </form>

        <div className="mt-8 pb-10 text-center">
          <p className="text-sm text-slate-500 dark:text-dark-text-secondary font-medium">
            {t('auth.alreadyHaveAccount')}{' '}
            <Link to="/login" className="text-primary font-bold ml-1 hover:underline">
              {t('auth.login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
