'use client';

import { useState } from 'react';
import { Link } from '@/lib/navigation';
import { useI18n } from '@/app/providers';
import { forgotPassword } from '@/lib/api/client';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';

export default function ForgotPassword() {
  const { t } = useI18n();
  const { trackUmamiEvent } = useUmamiTracking();
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
      trackUmamiEvent('forgot_password');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-dark-bg flex flex-col items-center justify-center px-6 safe-area-top safe-area-bottom">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
            <span
              className="material-symbols-outlined text-emerald-600 text-[32px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              check_circle
            </span>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-text-dark dark:text-white">
              {t('auth.checkEmail')}
            </h1>
            <p className="text-text-muted dark:text-dark-text-secondary text-sm leading-relaxed">
              {t('auth.resetLinkSent')}
            </p>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-primary font-semibold hover:text-primary-hover transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            {t('auth.backToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-light dark:bg-dark-bg flex flex-col safe-area-top safe-area-bottom">
      <div className="max-w-md w-full mx-auto px-6 pt-4">
        {/* Back button */}
        <Link
          to="/login"
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-dark-surface text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors mb-8"
          aria-label={t('common.back')}
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>

        {/* Key icon */}
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <span
            className="material-symbols-outlined text-primary text-[28px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            key
          </span>
        </div>

        <h1 className="text-2xl font-bold text-text-dark dark:text-white mb-1">
          {t('auth.resetPassword')}
        </h1>
        <p className="text-text-muted dark:text-dark-text-secondary text-sm mb-8">
          {t('auth.enterNewPassword')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3.5 border border-input-border dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface text-text-main dark:text-white placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            required
          />
          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-semibold py-4 rounded-2xl transition-all active:scale-[0.98]"
          >
            {loading ? t('common.loading') : t('auth.sendResetLink')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="text-sm text-primary font-medium hover:text-primary-hover transition-colors"
          >
            {t('auth.backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
}
