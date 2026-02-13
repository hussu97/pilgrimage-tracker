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
    <div className="min-h-screen flex flex-col overflow-hidden relative selection:bg-primary selection:text-white safe-area-top safe-area-bottom">
      {/* Background pattern from DESIGN_FILE */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, rgba(0, 122, 255, 0.05) 0%, transparent 60%),
            radial-gradient(circle at 100% 0%, rgba(0, 122, 255, 0.03) 0%, transparent 40%)`,
        }}
      />
      <main className="flex-1 flex flex-col justify-center items-center px-8 z-10 relative mt-10">
        {/* Logo block from DESIGN_FILE: compass-style circle with plus */}
        <div className="mb-14 relative group">
          <div
            className="absolute inset-0 bg-primary/15 blur-3xl rounded-full transform group-hover:scale-110 transition-transform duration-700"
            aria-hidden
          />
          <div className="w-36 h-36 relative bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center justify-center border border-white/50 backdrop-blur-sm ring-1 ring-black/5">
            <svg
              className="w-20 h-20 text-primary"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              <line x1="12" x2="12" y1="8" y2="16" />
              <line x1="8" x2="16" y1="12" y2="12" />
              <path d="M12 16c2.5 0 4-1.5 4-3" />
            </svg>
          </div>
        </div>
        <div className="text-center space-y-5 max-w-xs mx-auto">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            {t('splash.appName') || 'Pilgrimage'}
          </h1>
          <p className="text-text-dark text-lg font-normal leading-relaxed opacity-90">
            {t('splash.tagline').includes('Sacred Spaces')
              ? <>Discover, Visit, and Track <br /> Sacred Spaces</>
              : t('splash.tagline')}
          </p>
        </div>
      </main>
      <footer className="w-full px-8 pb-10 pt-6 z-10 relative">
        <div className="flex flex-col gap-5 max-w-sm mx-auto w-full">
          <Link
            to="/register"
            className="w-full bg-primary hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-2xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] flex items-center justify-center group"
          >
            <span>{t('splash.getStarted')}</span>
            <span className="material-symbols-outlined text-sm ml-2 group-hover:translate-x-1 transition-transform" aria-hidden>
              arrow_forward
            </span>
          </Link>
          <Link
            to="/login"
            className="w-full py-2 text-sm text-gray-500 font-medium hover:text-primary transition-colors flex items-center justify-center gap-1"
          >
            {t('splash.haveAccount')}
          </Link>
        </div>
      </footer>
    </div>
  );
}
