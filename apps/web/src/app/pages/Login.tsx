import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers';
import { useI18n } from '@/app/providers';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!loading && user) {
    const from = (location.state as { from?: { pathname?: string } })?.from?.pathname;
    return <Navigate to={from ?? '/home'} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      const from = (location.state as { from?: { pathname?: string } })?.from?.pathname;
      navigate(from ?? '/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.loginFailed'));
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-8 safe-area-top safe-area-bottom">
      <h1 className="text-2xl font-bold text-text-main mb-2">{t('auth.login')}</h1>
      <p className="text-text-muted mb-6">{t('auth.loginWelcome')}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder={t('auth.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 border border-input-border rounded-xl bg-background-light text-text-main"
          required
        />
        <input
          type="password"
          placeholder={t('auth.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 border border-input-border rounded-xl bg-background-light text-text-main"
          required
        />
        <Link to="/forgot-password" className="text-sm text-primary hover:text-primary-hover">
          {t('auth.forgotPassword')}
        </Link>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" className="w-full bg-primary hover:bg-primary-hover text-white py-3 rounded-xl font-semibold transition-colors">
          {t('auth.login')}
        </button>
      </form>
      <Link to="/register" className="block mt-6 text-center text-sm text-text-muted hover:text-primary">
        {t('auth.createAccount')}
      </Link>
    </div>
  );
}
