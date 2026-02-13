import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useI18n } from '@/app/providers';
import { getNotifications } from '@/lib/api/client';

const navItems = [
  { path: '/home', labelKey: 'nav.explore', icon: 'explore' },
  { path: '/favorites', labelKey: 'nav.saved', icon: 'bookmark' },
  { path: '/groups', labelKey: 'nav.pilgrimage', icon: 'groups' },
  { path: '/profile', labelKey: 'nav.profile', icon: 'person' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { t } = useI18n();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    getNotifications(1, 0)
      .then((res) => setUnreadCount(res.unread_count ?? 0))
      .catch(() => {});
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col font-display">
      <header className="hidden md:flex safe-area-top border-b border-input-border bg-background-light px-6 py-4">
        <nav className="flex items-center gap-6 w-full max-w-6xl mx-auto">
          <Link to="/" className="text-xl font-semibold text-primary">{t('common.appName')}</Link>
          <Link to="/home" className="text-text-muted hover:text-primary" aria-current={location.pathname === '/home' ? 'page' : undefined}>{t('nav.explore')}</Link>
          <Link to="/favorites" className="text-text-muted hover:text-primary" aria-current={location.pathname === '/favorites' ? 'page' : undefined}>{t('nav.saved')}</Link>
          <Link to="/groups" className="text-text-muted hover:text-primary" aria-current={location.pathname.startsWith('/groups') ? 'page' : undefined}>{t('nav.groups')}</Link>
          <Link to="/notifications" className="relative text-text-muted hover:text-primary" aria-label={t('nav.notifications')} aria-current={location.pathname === '/notifications' ? 'page' : undefined}>
            <span className="material-symbols-outlined">notifications</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
          <Link to="/profile" className="ml-auto text-text-muted hover:text-primary" aria-current={location.pathname === '/profile' ? 'page' : undefined}>{t('nav.profile')}</Link>
        </nav>
      </header>

      <main className="flex-1 safe-area-top safe-area-bottom pb-20 md:pb-6 w-full max-w-6xl mx-auto px-0">
        {children}
      </main>

      <Link to="/notifications" className="md:hidden fixed top-4 right-4 z-30 w-10 h-10 rounded-full bg-white dark:bg-gray-800 shadow flex items-center justify-center relative focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={t('nav.notifications')}>
        <span className="material-symbols-outlined text-text-main">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Link>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 safe-area-bottom bg-background-light border-t border-input-border z-40 py-2 px-2" aria-label="Main navigation">
        <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
          {navItems.map(({ path, labelKey, icon }) => {
            const isActive = location.pathname === path || (path === '/groups' && location.pathname.startsWith('/groups'));
            return (
              <Link
                key={path}
                to={path}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  isActive ? 'text-primary' : 'text-text-muted hover:text-text-main'
                }`}
              >
                <span className="material-symbols-outlined text-2xl" aria-hidden>{icon}</span>
                <span className="text-[10px] font-medium">{t(labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
