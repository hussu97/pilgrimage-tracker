'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/lib/navigation';
import { useAuth, useI18n } from '@/app/providers';
import Modal from '@/components/common/Modal';
import { cn } from '@/lib/utils/cn';
import { getFieldRules } from '@/lib/api/client';
import type { PasswordRule } from '@/lib/api/client';
import { checkRule, ruleTranslationKey } from '@/lib/utils/passwordRules';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptKey?: string;
}

type Tab = 'login' | 'register';

export default function AuthModal({ isOpen, onClose, promptKey }: AuthModalProps) {
  const { login, register } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passwordRules, setPasswordRules] = useState<PasswordRule[]>([]);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    getFieldRules()
      .then((data) => {
        const pwField = data.fields.find((f) => f.name === 'password');
        if (pwField) setPasswordRules(pwField.rules);
      })
      .catch(() => {
        setPasswordRules([
          { type: 'min_length', value: 8 },
          { type: 'require_uppercase' },
          { type: 'require_lowercase' },
          { type: 'require_digit' },
        ]);
      });
  }, []);

  const minLength = passwordRules.find((r) => r.type === 'min_length')?.value ?? 8;

  function resetForm() {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setConfirm('');
    setError('');
    setSubmitting(false);
    setShowRules(false);
  }

  function switchTab(t: Tab) {
    setTab(t);
    setError('');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (password.length < minLength) {
      setError(t('auth.passwordMinLength'));
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password, displayName.trim() || undefined);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.registrationFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full px-4 py-3 border border-slate-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface text-slate-800 dark:text-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm';

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="py-2">
        {/* Prompt */}
        {promptKey && (
          <div className="mb-5 p-3 rounded-xl bg-soft-blue dark:bg-primary/10 border border-soft-blue dark:border-primary/30">
            <p className="text-sm font-semibold text-primary">{t(promptKey)}</p>
            <p className="text-xs text-slate-500 dark:text-dark-text-secondary mt-0.5">
              {t('visitor.loginRequiredDesc')}
            </p>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 bg-slate-100 dark:bg-dark-border/50 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => switchTab('login')}
            className={cn(
              'flex-1 py-2 text-sm font-semibold rounded-lg transition-all',
              tab === 'login'
                ? 'bg-white dark:bg-dark-surface text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-dark-text-secondary',
            )}
          >
            {t('auth.login')}
          </button>
          <button
            type="button"
            onClick={() => switchTab('register')}
            className={cn(
              'flex-1 py-2 text-sm font-semibold rounded-lg transition-all',
              tab === 'register'
                ? 'bg-white dark:bg-dark-surface text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-dark-text-secondary',
            )}
          >
            {t('auth.register')}
          </button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <label htmlFor="login-email" className="sr-only">
              {t('auth.email')}
            </label>
            <input
              id="login-email"
              type="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              autoComplete="email"
              required
            />
            <label htmlFor="login-password" className="sr-only">
              {t('auth.password')}
            </label>
            <input
              id="login-password"
              type="password"
              placeholder={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
              required
            />
            <div className="text-right">
              <Link
                to="/forgot-password"
                onClick={onClose}
                className="text-xs text-primary hover:underline font-medium"
              >
                {t('auth.forgotPassword')}
              </Link>
            </div>
            {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/10 dark:shadow-none transition-all text-sm"
            >
              {submitting ? t('common.loading') : t('auth.login')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3">
            <label htmlFor="register-name" className="sr-only">
              {t('auth.fullName')}
            </label>
            <input
              id="register-name"
              type="text"
              placeholder={t('auth.fullName')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
              autoComplete="name"
            />
            <label htmlFor="register-email" className="sr-only">
              {t('auth.email')}
            </label>
            <input
              id="register-email"
              type="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              autoComplete="email"
              required
            />
            <div>
              <label htmlFor="register-password" className="sr-only">
                {t('auth.password')}
              </label>
              <input
                id="register-password"
                type="password"
                placeholder={t('auth.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setShowRules(true)}
                className={inputClass}
                autoComplete="new-password"
                required
                minLength={minLength}
              />
              {/* Live password rule checklist */}
              {showRules && passwordRules.length > 0 && (
                <ul className="mt-2 px-1 space-y-1">
                  {passwordRules.map((rule) => {
                    const met = password.length > 0 && checkRule(rule, password);
                    const label = t(ruleTranslationKey(rule)).replace(
                      '{count}',
                      rule.type === 'min_length' ? String(rule.value ?? 8) : '',
                    );
                    return (
                      <li key={rule.type} className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'text-xs font-bold w-3',
                            met ? 'text-green-500' : 'text-slate-400 dark:text-dark-text-secondary',
                          )}
                        >
                          {met ? '✓' : '○'}
                        </span>
                        <span
                          className={cn(
                            'text-xs',
                            met ? 'text-green-500' : 'text-slate-400 dark:text-dark-text-secondary',
                          )}
                        >
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <label htmlFor="register-confirm" className="sr-only">
              {t('auth.confirmPassword')}
            </label>
            <input
              id="register-confirm"
              type="password"
              placeholder={t('auth.confirmPassword')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
              required
            />
            {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/10 dark:shadow-none transition-all text-sm"
            >
              {submitting ? t('common.loading') : t('auth.register')}
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}
