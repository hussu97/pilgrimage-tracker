import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useI18n } from '@/app/providers';
import Modal from '@/components/common/Modal';
import { cn } from '@/lib/utils/cn';

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

  function resetForm() {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setConfirm('');
    setError('');
    setSubmitting(false);
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
      // user state is updated in context — pass current user (will be set by now)
      resetForm();
      // onSuccess will be called by effect watching user change in AuthGateProvider
      onClose();
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
    if (password.length < 6) {
      setError(t('auth.passwordMinLength'));
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password, displayName.trim() || undefined);
      resetForm();
      onClose();
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
          <div className="mb-5 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30">
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
            <input
              type="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              required
            />
            <input
              type="password"
              placeholder={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
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
              className="w-full bg-primary hover:bg-blue-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-100 dark:shadow-none transition-all text-sm"
            >
              {submitting ? t('common.loading') : t('auth.login')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3">
            <input
              type="text"
              placeholder={t('auth.fullName')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
            <input
              type="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              required
            />
            <input
              type="password"
              placeholder={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              required
              minLength={6}
            />
            <input
              type="password"
              placeholder={t('auth.confirmPassword')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
              required
            />
            {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary hover:bg-blue-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-100 dark:shadow-none transition-all text-sm"
            >
              {submitting ? t('common.loading') : t('auth.register')}
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}
