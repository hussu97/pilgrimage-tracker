import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/app/providers';
import { useI18n } from '@/app/providers';

export default function Splash() {
  const { user, loading } = useAuth();
  const { t } = useI18n();

  if (!loading && user) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="flex flex-col min-h-[70vh] justify-center items-center px-8 safe-area-top safe-area-bottom">
      <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-4xl text-primary">explore</span>
      </div>
      <h1 className="text-3xl font-bold text-text-main mb-2 text-center">{t('splash.welcome')}</h1>
      <p className="text-text-muted text-center mb-10">{t('splash.tagline')}</p>
      <Link
        to="/register"
        className="w-full max-w-sm bg-primary hover:bg-primary-hover text-white font-semibold py-4 px-6 rounded-xl text-center transition-colors"
      >
        {t('splash.getStarted')}
      </Link>
      <Link to="/login" className="mt-6 text-sm text-text-muted hover:text-primary transition-colors">
        {t('splash.haveAccount')}
      </Link>
    </div>
  );
}
