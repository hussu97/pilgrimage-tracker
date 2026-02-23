import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { resetPassword } from '@/lib/api/client';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!token) {
      setError(t('errors.missingToken'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.passwordMinLength'));
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.invalidOrExpiredToken'));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto px-6 py-8 safe-area-top safe-area-bottom bg-white dark:bg-dark-bg">
        <h1 className="text-2xl font-bold text-text-main dark:text-white mb-2">
          {t('auth.passwordUpdated')}
        </h1>
        <p className="text-text-muted dark:text-dark-text-secondary mb-6">
          {t('auth.backToLogin')}
        </p>
        <Link
          to="/login"
          className="inline-block bg-primary hover:bg-primary-hover text-white py-3 px-6 rounded-xl font-semibold"
        >
          {t('auth.login')}
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="max-w-md mx-auto px-6 py-8 safe-area-top safe-area-bottom bg-white dark:bg-dark-bg">
        <p className="text-red-600 dark:text-red-400 mb-4">{t('errors.missingToken')}</p>
        <Link to="/forgot-password" className="text-primary hover:text-primary-hover font-medium">
          {t('auth.sendResetLink')}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-8 safe-area-top safe-area-bottom bg-white dark:bg-dark-bg">
      <h1 className="text-2xl font-bold text-text-main dark:text-white mb-2">
        {t('auth.setNewPassword')}
      </h1>
      <p className="text-text-muted dark:text-dark-text-secondary mb-6">
        {t('auth.enterNewPassword')}
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="password"
          placeholder={t('auth.newPassword')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 border border-input-border rounded-xl bg-background-light text-text-main dark:bg-dark-surface dark:border-dark-border dark:text-white"
          required
          minLength={6}
        />
        <input
          type="password"
          placeholder={t('auth.confirmPassword')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-4 py-3 border border-input-border rounded-xl bg-background-light text-text-main dark:bg-dark-surface dark:border-dark-border dark:text-white"
          required
        />
        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary hover:bg-primary-hover text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('auth.resetPassword')}
        </button>
      </form>
      <Link
        to="/login"
        className="block mt-6 text-center text-sm text-text-muted hover:text-primary"
      >
        {t('auth.backToLogin')}
      </Link>
    </div>
  );
}
