import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useI18n } from '@/app/providers';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, login } = useAuth();
  const { t } = useI18n();
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
      const from = (location.state as { from?: { pathname?: string } })?.from?.pathname;
      navigate(from ?? '/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background-light dark:bg-dark-bg flex flex-col safe-area-top safe-area-bottom">
      <div className="max-w-md w-full mx-auto px-6 pt-4">
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

        <h1 className="text-2xl font-bold text-text-dark dark:text-white mb-1">{t('auth.login')}</h1>
        <p className="text-text-muted dark:text-dark-text-secondary text-sm mb-8">{t('auth.loginWelcome')}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3.5 border border-input-border dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-text-main dark:text-white placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            required
          />
          <div className="space-y-1">
            <input
              type="password"
              placeholder={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 border border-input-border dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-text-main dark:text-white placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              required
            />
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm text-primary hover:text-primary-hover font-medium">
                {t('auth.forgotPassword')}
              </Link>
            </div>
          </div>
          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-semibold py-4 rounded-2xl transition-all active:scale-[0.98]"
          >
            {submitting ? t('common.loading') : t('auth.login')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted dark:text-dark-text-secondary">
          {t('auth.createAccount')}{' '}
          <Link to="/register" className="text-primary font-semibold hover:text-primary-hover">
            {t('auth.register')}
          </Link>
        </p>
      </div>
    </div>
  );
}
