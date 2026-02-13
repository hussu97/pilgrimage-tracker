import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers';
import { useI18n } from '@/app/providers';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { t } = useI18n();
  const [display_name, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
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
    try {
      await register(email, password, display_name || undefined);
      navigate('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.registrationFailed'));
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-8 safe-area-top safe-area-bottom">
      <h1 className="text-2xl font-bold text-text-main mb-2">{t('auth.registerTitle')}</h1>
      <p className="text-text-muted mb-6">{t('auth.registerSubtitle')}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder={t('auth.fullName')}
          value={display_name}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full px-4 py-3 border border-input-border rounded-xl bg-background-light text-text-main"
        />
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
          minLength={6}
        />
        <input
          type="password"
          placeholder={t('auth.confirmPassword')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-4 py-3 border border-input-border rounded-xl bg-background-light text-text-main"
          required
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" className="w-full bg-primary hover:bg-primary-hover text-white py-3 rounded-xl font-semibold transition-colors">
          {t('auth.registerTitle')}
        </button>
      </form>
      <Link to="/login" className="block mt-6 text-center text-sm text-text-muted hover:text-primary">
        {t('auth.alreadyHaveAccount')}
      </Link>
    </div>
  );
}
