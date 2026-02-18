import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, useI18n } from '@/app/providers';
import { getNotifications } from '@/lib/api/client';

const navItems = [
  { path: '/home', labelKey: 'nav.explore', icon: 'explore' },
  { path: '/groups', labelKey: 'nav.groups', icon: 'groups' },
  { path: '/profile', labelKey: 'nav.profile', icon: 'person' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useI18n();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    getNotifications(1, 0)
      .then((res) => setUnreadCount(res.unread_count ?? 0))
      .catch(() => {});
  }, [user, location.pathname]);

  return (
    <div className="min-h-screen flex flex-col font-display dark:bg-dark-bg dark:text-white">
      <header className="hidden md:flex safe-area-top border-b border-input-border dark:border-dark-border bg-background-light dark:bg-dark-surface px-6 py-4">
        <nav className="flex items-center gap-8 w-full max-w-6xl xl:max-w-7xl mx-auto">
          <Link
            to="/home"
            className="text-xl font-semibold text-primary hover:text-primary-hover transition-colors"
            aria-label={t('nav.explore')}
          >
            {t('common.appName')}
          </Link>
          <Link
            to="/home"
            className="text-text-muted hover:text-primary font-medium transition-colors dark:text-dark-text-secondary"
            aria-current={location.pathname === '/home' ? 'page' : undefined}
          >
            {t('nav.explore')}
          </Link>
          <Link
            to="/groups"
            className="text-text-muted hover:text-primary font-medium transition-colors dark:text-dark-text-secondary"
            aria-current={location.pathname.startsWith('/groups') ? 'page' : undefined}
          >
            {t('nav.groups')}
          </Link>
          <span className="ml-auto flex items-center gap-4">
            {user ? (
              <Link
                to="/profile"
                className="text-text-muted hover:text-primary font-medium transition-colors dark:text-dark-text-secondary"
                aria-current={location.pathname === '/profile' ? 'page' : undefined}
              >
                {t('nav.profile')}
              </Link>
            ) : (
              <Link
                to="/login"
                className="text-text-muted hover:text-primary font-medium transition-colors dark:text-dark-text-secondary"
              >
                {t('auth.login')}
              </Link>
            )}
          </span>
        </nav>
      </header>

      <main className="flex-1 safe-area-top safe-area-bottom pb-20 md:pb-6 w-full max-w-6xl xl:max-w-7xl mx-auto px-0">
        {children}
      </main>

      {/* Bottom navigation – glass effect with backdrop-blur-lg */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[500]" aria-label="Main navigation">
        {/* Glass background layer */}
        <div className="absolute inset-0 bg-white/80 dark:bg-dark-bg/80 backdrop-blur-lg border-t border-white/30 dark:border-white/5" />
        {/* Subtle top shadow */}
        <div className="absolute top-0 left-0 right-0 h-px bg-slate-200/60 dark:bg-white/8" />

        <div className="relative grid grid-cols-3 gap-1 max-w-md mx-auto px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {navItems.map(({ path, labelKey, icon }) => {
            const isActive =
              location.pathname === path ||
              (path === '/groups' && location.pathname.startsWith('/groups'));
            const showDot = icon === 'person' && unreadCount > 0;
            return (
              <Link
                key={path}
                to={path}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all duration-200 relative group active:scale-90 ${
                  isActive ? 'text-primary' : 'text-slate-400 dark:text-dark-text-secondary'
                }`}
              >
                {/* Active indicator dot */}
                {isActive && (
                  <span className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
                <div className="relative">
                  <span
                    className="material-symbols-outlined text-[26px] transition-all duration-200"
                    style={
                      isActive
                        ? { fontVariationSettings: "'FILL' 1, 'wght' 600" }
                        : { fontVariationSettings: "'wght' 300" }
                    }
                    aria-hidden
                  >
                    {icon}
                  </span>
                  {showDot && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full ring-1 ring-white dark:ring-dark-bg" />
                  )}
                </div>
                {/* Label: visible (bold) when active, muted + smaller when inactive */}
                <span
                  className={`text-[9px] font-bold tracking-tight uppercase transition-all ${
                    isActive ? 'opacity-100' : 'opacity-50 text-[8px]'
                  }`}
                >
                  {t(labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
