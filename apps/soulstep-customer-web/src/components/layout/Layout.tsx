'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from '@/lib/navigation';
import type { ReactNode } from 'react';
import { useAuth, useI18n } from '@/app/providers';
import { getNotifications } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: boolean;
}

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useI18n();
  const [unreadCount, setUnreadCount] = useState(0);
  const userCode = user?.user_code;

  useEffect(() => {
    if (!userCode) {
      setUnreadCount(0);
      return;
    }
    getNotifications(1, 0)
      .then((res) => setUnreadCount(res.unread_count ?? 0))
      .catch(() => {});
  }, [userCode]);

  const hideBottomNav =
    location.pathname.startsWith('/journeys/new') ||
    location.pathname.startsWith('/groups/new') ||
    location.pathname.includes('/edit') ||
    location.pathname.endsWith('/review') ||
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/forgot-password' ||
    location.pathname === '/reset-password';

  const navItems = useMemo<NavItem[]>(() => {
    const isDiscover =
      location.pathname === '/' ||
      location.pathname === '/home' ||
      location.pathname === '/dashboard' ||
      location.pathname === '/places';
    const isMap = location.pathname === '/map';
    const isJourneys =
      location.pathname === '/journeys' ||
      location.pathname.startsWith('/journeys/') ||
      location.pathname === '/groups' ||
      location.pathname.startsWith('/groups/');
    const isProfile =
      location.pathname === '/profile' ||
      location.pathname.startsWith('/profile/') ||
      location.pathname === '/favorites';

    return [
      { href: '/home', label: t('nav.discover'), icon: 'explore', active: isDiscover },
      { href: '/map', label: t('nav.map'), icon: 'map', active: isMap },
      { href: '/journeys', label: t('nav.journeys'), icon: 'route', active: isJourneys },
      {
        href: userCode ? '/profile' : '/login?from=/profile',
        label: t('nav.profile'),
        icon: 'person',
        active: isProfile,
        badge: unreadCount > 0,
      },
    ];
  }, [location.pathname, t, unreadCount, userCode]);

  return (
    <div className="flex min-h-screen flex-col font-display dark:bg-dark-bg dark:text-white overflow-x-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[9999] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {t('common.skipToContent') || 'Skip to content'}
      </a>

      <header className="safe-area-top relative z-[800] hidden border-b border-input-border bg-background-light px-6 py-3 dark:border-dark-border dark:bg-dark-surface md:flex">
        <nav className="mx-auto flex w-full max-w-6xl items-center gap-7 xl:max-w-7xl">
          <Link
            to="/home"
            className="mr-2 flex items-center gap-2 text-lg font-semibold text-primary transition-colors hover:text-primary-hover"
            aria-label="SoulStep"
          >
            <img src="/logo.png" className="h-7 w-7 rounded-lg" alt="" />
            {t('common.appName')}
          </Link>

          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                aria-current={item.active ? 'page' : undefined}
                className={cn(
                  'relative inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition-colors',
                  item.active
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-muted hover:bg-slate-100 hover:text-text-primary dark:text-dark-text-secondary dark:hover:bg-dark-bg dark:hover:text-white',
                )}
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
                {item.badge && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-dark-surface" />
                )}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main
        id="main-content"
        className={cn(
          'safe-area-top mx-auto w-full max-w-6xl flex-1 px-0 md:pb-6 xl:max-w-7xl',
          hideBottomNav ? 'pb-6' : 'pb-[var(--mobile-bottom-nav-height)]',
        )}
      >
        {children}
      </main>

      <footer className="hidden border-t border-slate-100 bg-white dark:border-dark-border dark:bg-dark-surface md:block">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-text-secondary dark:text-dark-text-secondary md:flex-row xl:max-w-7xl">
          <span>{t('footer.copyright').replace('{year}', String(new Date().getFullYear()))}</span>
          <nav className="flex flex-wrap items-center gap-4" aria-label="Footer">
            <Link to="/about" className="transition-colors hover:text-primary">
              {t('footer.about')}
            </Link>
            <Link to="/blog" className="transition-colors hover:text-primary">
              {t('footer.blog')}
            </Link>
            <Link to="/privacy" className="transition-colors hover:text-primary">
              {t('footer.privacy')}
            </Link>
            <Link to="/terms" className="transition-colors hover:text-primary">
              {t('footer.terms')}
            </Link>
            <Link to="/contact" className="transition-colors hover:text-primary">
              {t('footer.contact')}
            </Link>
            <Link to="/developers" className="transition-colors hover:text-primary">
              {t('footer.api')}
            </Link>
          </nav>
        </div>
      </footer>

      {!hideBottomNav && (
        <nav
          className="fixed inset-x-0 bottom-0 z-[500] md:hidden"
          aria-label="Main navigation"
          style={{ minHeight: 'var(--mobile-bottom-nav-height)' }}
        >
          <div className="absolute inset-0 border-t border-white/30 bg-white/90 backdrop-blur-xl dark:border-white/5 dark:bg-dark-bg/90" />
          <div className="relative mx-auto grid max-w-md grid-cols-4 px-1 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                aria-current={item.active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold transition active:scale-95',
                  item.active ? 'text-primary' : 'text-slate-500 dark:text-dark-text-secondary',
                )}
              >
                {item.active && (
                  <span className="absolute top-0 h-0.5 w-6 rounded-full bg-primary" />
                )}
                <span
                  className="material-symbols-outlined text-[24px]"
                  style={
                    item.active
                      ? { fontVariationSettings: "'FILL' 1, 'wght' 600" }
                      : { fontVariationSettings: "'wght' 350" }
                  }
                  aria-hidden
                >
                  {item.icon}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
                {item.badge && (
                  <span className="absolute right-5 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-dark-bg" />
                )}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
