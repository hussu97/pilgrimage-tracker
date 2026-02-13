import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '@/api/client';
import { useI18n } from '@/context/I18nContext';

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (sent) {
    return (
      <div className="max-w-md mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-text-main mb-2">{t('auth.checkEmail')}</h1>
        <p className="text-text-muted mb-6">{t('auth.resetLinkSent')}</p>
        <Link to="/login" className="text-primary font-medium">{t('auth.backToLogin')}</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-text-main mb-2">{t('auth.forgotPassword')}</h1>
      <p className="text-text-muted mb-6">Enter your email and we’ll send you a reset link.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder={t('auth.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 border border-input-border rounded-xl"
          required
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-semibold">
          {t('auth.sendResetLink')}
        </button>
      </form>
      <Link to="/login" className="block mt-6 text-center text-sm text-text-muted">{t('auth.backToLogin')}</Link>
    </div>
  );
}
