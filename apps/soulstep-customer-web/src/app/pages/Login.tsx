import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useI18n } from '@/app/providers';
import { useAnalytics } from '@/lib/hooks/useAnalytics';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, login } = useAuth();
  const { t } = useI18n();
  const { trackEvent } = useAnalytics();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    const from = (location.state as { from?: { pathname?: string } })?.from?.pathname;
    return <Navigate to={from ?? '/home'} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      trackEvent('login');
      const from = (location.state as { from?: { pathname?: string } })?.from?.pathname;
      navigate(from ?? '/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/home');
  }

  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg flex flex-col relative overflow-hidden">
      {/* Background Gradient Panel */}
      <div className="absolute top-0 left-0 w-full h-80 bg-gradient-to-b from-soft-blue to-transparent dark:from-primary/5 dark:to-transparent pointer-events-none z-0" />

      <div className="relative z-10 max-w-sm w-full mx-auto px-8 pt-12 flex-1 flex flex-col">
        {/* Back button */}
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 text-slate-400 dark:text-dark-text-secondary hover:text-primary transition-colors mb-8 text-sm font-medium self-start"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
        </button>

        {/* Logo icon */}
        <img src="/logo.png" className="w-12 h-12 rounded-2xl mb-6" alt="SoulStep" />

        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight mb-2">
          {t('auth.login')}
        </h1>
        <p className="text-slate-500 dark:text-dark-text-secondary font-medium mb-12">
          {t('auth.loginWelcome')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-2 ml-1">
              {t('auth.email')}
            </label>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-4 border border-slate-200 dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-slate-800 dark:text-white placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-soft-blue dark:focus:ring-primary/10 focus:border-primary transition-all outline-none"
              required
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] ml-1">
                {t('auth.password')}
              </label>
              <Link
                to="/forgot-password"
                title={t('auth.forgotPassword')}
                className="text-xs font-semibold text-primary hover:text-primary-hover transition-colors"
              >
                {t('auth.forgotPassword')}
              </Link>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-4 border border-slate-200 dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-slate-800 dark:text-white placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-soft-blue dark:focus:ring-primary/10 focus:border-primary transition-all outline-none"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm font-medium ml-1">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-bold py-4 rounded-2xl shadow-xl shadow-primary/10 dark:shadow-none transition-all active:scale-[0.98] mt-4"
          >
            {submitting ? t('common.loading') : t('auth.login')}
          </button>
        </form>

        <div className="mt-auto pt-10 pb-8 text-center">
          <p className="text-sm text-slate-500 dark:text-dark-text-secondary font-medium">
            {t('auth.createAccount')}{' '}
            <Link to="/register" className="text-primary font-bold ml-1 hover:underline">
              {t('auth.register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
