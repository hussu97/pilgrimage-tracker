import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, useI18n } from '@/app/providers';
import { getNotifications } from '@/lib/api/client';

const navItems = [
  { path: '/home', labelKey: 'nav.explore', icon: 'explore' },
  { path: '/map', labelKey: 'nav.map', icon: 'map' },
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
          <Link to="/home" className="text-xl font-semibold text-primary hover:text-primary-hover transition-colors" aria-label={t('nav.explore')}>{t('common.appName')}</Link>
          <Link to="/home" className="text-text-muted hover:text-primary font-medium transition-colors dark:text-dark-text-secondary" aria-current={location.pathname === '/home' ? 'page' : undefined}>{t('nav.explore')}</Link>
          <Link to="/map" className="text-text-muted hover:text-primary font-medium transition-colors dark:text-dark-text-secondary" aria-current={location.pathname === '/map' ? 'page' : undefined}>{t('nav.map')}</Link>
          <Link to="/groups" className="text-text-muted hover:text-primary font-medium transition-colors dark:text-dark-text-secondary" aria-current={location.pathname.startsWith('/groups') ? 'page' : undefined}>{t('nav.groups')}</Link>
          <span className="ml-auto flex items-center gap-4">
            <Link to="/notifications" className="relative text-text-muted hover:text-primary p-1 -mr-1 dark:text-dark-text-secondary" aria-label={t('nav.notifications')} aria-current={location.pathname === '/notifications' ? 'page' : undefined}>
              <span className="material-symbols-outlined">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            {user ? (
              <Link to="/profile" className="text-text-muted hover:text-primary font-medium transition-colors dark:text-dark-text-secondary" aria-current={location.pathname === '/profile' ? 'page' : undefined}>{t('nav.profile')}</Link>
            ) : (
              <Link to="/login" className="text-text-muted hover:text-primary font-medium transition-colors dark:text-dark-text-secondary">{t('auth.login')}</Link>
            )}
          </span>
        </nav>
      </header>

      <main className="flex-1 safe-area-top safe-area-bottom pb-20 md:pb-6 w-full max-w-6xl xl:max-w-7xl mx-auto px-0">
        {children}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-dark-bg/90 backdrop-blur-xl border-t border-slate-100 dark:border-dark-border z-40 pb-[env(safe-area-inset-bottom,20px)] pt-1 px-2" aria-label="Main navigation">
        <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
          {navItems.map(({ path, labelKey, icon }) => {
            const isActive = location.pathname === path || (path === '/groups' && location.pathname.startsWith('/groups'));
            const showDot = icon === 'person' && unreadCount > 0;
            return (
              <Link
                key={path}
                to={path}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 pt-2 pb-1 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  isActive ? 'text-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {isActive && (
                  <span className="w-5 h-[3px] rounded-full bg-primary mb-0.5" aria-hidden />
                )}
                <div className="relative p-0.5">
                  <span
                    className="material-symbols-outlined text-[24px]"
                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    aria-hidden
                  >
                    {icon}
                  </span>
                  {showDot && (
                    <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-dark-bg" />
                  )}
                </div>
                <span className="text-[10px] font-medium tracking-wide">{t(labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
