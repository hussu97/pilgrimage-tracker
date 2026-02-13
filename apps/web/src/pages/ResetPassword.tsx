import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { resetPassword } from '@/api/client';
import { useI18n } from '@/context/I18nContext';

export default function ResetPassword() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (!token) {
      setError(t('errors.missingToken'));
      return;
    }
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.invalidOrExpiredToken'));
    }
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-text-main mb-2">{t('auth.resetPassword')}</h1>
        <p className="text-text-muted mb-6">{t('auth.passwordUpdated')}</p>
        <Link to="/login" className="text-primary font-medium">{t('auth.login')}</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-text-main mb-2">{t('auth.setNewPassword')}</h1>
      <p className="text-text-muted mb-6">{t('auth.enterNewPassword')}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="password"
          placeholder={t('auth.newPassword')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 border border-input-border rounded-xl"
          required
          minLength={6}
        />
        <input
          type="password"
          placeholder={t('auth.confirmPassword')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-4 py-3 border border-input-border rounded-xl"
          required
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-semibold">
          {t('auth.resetPassword')}
        </button>
      </form>
      <Link to="/login" className="block mt-6 text-center text-sm text-text-muted">{t('auth.backToLogin')}</Link>
    </div>
  );
}
