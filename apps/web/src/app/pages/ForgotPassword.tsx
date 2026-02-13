import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { forgotPassword } from '@/lib/api/client';

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="max-w-md mx-auto px-6 py-8 safe-area-top safe-area-bottom">
        <h1 className="text-2xl font-bold text-text-main mb-2">{t('auth.checkEmail')}</h1>
        <p className="text-text-muted mb-6">{t('auth.resetLinkSent')}</p>
        <Link to="/login" className="text-primary hover:text-primary-hover font-medium">
          {t('auth.backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-8 safe-area-top safe-area-bottom">
      <h1 className="text-2xl font-bold text-text-main mb-2">{t('auth.resetPassword')}</h1>
      <p className="text-text-muted mb-6">{t('auth.sendResetLink')}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder={t('auth.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 border border-input-border rounded-xl bg-background-light text-text-main"
          required
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary hover:bg-primary-hover text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('auth.sendResetLink')}
        </button>
      </form>
      <Link to="/login" className="block mt-6 text-center text-sm text-text-muted hover:text-primary">
        {t('auth.backToLogin')}
      </Link>
    </div>
  );
}
