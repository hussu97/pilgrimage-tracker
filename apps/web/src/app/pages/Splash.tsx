import { Link, Navigate } from 'react-router-dom';
import { useAuth, useI18n } from '@/app/providers';

export default function Splash() {
  const { user, loading } = useAuth();
  const { t } = useI18n();

  if (!loading && user) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col overflow-hidden relative">
      {/* Hero image — 55vh */}
      <div className="relative flex-none" style={{ height: '55vh' }}>
        <img
          src="https://images.unsplash.com/photo-1548013146-72479768bada?w=1200&auto=format&fit=crop"
          alt=""
          className="w-full h-full object-cover"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60"
          aria-hidden
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-between px-8 pt-8 pb-10 bg-white dark:bg-dark-bg safe-area-bottom">
        <div className="space-y-3 max-w-sm mx-auto w-full text-center">
          <img src="/logo.png" className="w-16 h-16 rounded-2xl mx-auto mb-2" alt="SoulStep" />
          <h1 className="text-3xl font-bold tracking-tight text-text-dark dark:text-white leading-tight">
            {t('splash.heroTitle') || t('splash.welcome')}
          </h1>
          <p className="text-text-secondary dark:text-dark-text-secondary text-base leading-relaxed">
            {t('splash.tagline')}
          </p>
        </div>

        <div className="flex flex-col gap-3 max-w-sm mx-auto w-full mt-8">
          <Link
            to="/register"
            className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-4 px-6 rounded-3xl shadow-floating transition-all active:scale-[0.98] flex items-center justify-center"
          >
            {t('splash.getStarted')}
          </Link>
          <Link
            to="/login"
            className="w-full py-4 px-6 rounded-3xl border-2 border-primary text-primary font-semibold hover:bg-primary/5 transition-all active:scale-[0.98] flex items-center justify-center"
          >
            {t('splash.signIn') || t('auth.login')}
          </Link>
        </div>
      </div>

      {/* Decorative faded bottom nav hint */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 flex justify-center gap-8 pb-2 opacity-20"
        aria-hidden
      >
        {['explore', 'map', 'groups', 'person'].map((icon) => (
          <span key={icon} className="material-symbols-outlined text-slate-600 text-[22px]">
            {icon}
          </span>
        ))}
      </div>
    </div>
  );
}
