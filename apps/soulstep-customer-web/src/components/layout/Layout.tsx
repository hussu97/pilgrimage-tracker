'use client';

import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from '@/lib/navigation';
import type { ReactNode } from 'react';
import { useAuth, useI18n } from '@/app/providers';
import { getNotifications } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch notification count on login only — not on every route change
  useEffect(() => {
    if (!user) return;
    getNotifications(1, 0)
      .then((res) => setUnreadCount(res.unread_count ?? 0))
      .catch(() => {});
  }, [user?.user_code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show bottom nav on main screens, hide on onboarding / creation flows
  const hideBottomNav =
    location.pathname.startsWith('/journeys/new') ||
    location.pathname.startsWith('/groups/new') ||
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/forgot-password' ||
    location.pathname === '/reset-password';

  const showBottomNav = !hideBottomNav;

  const isDashboard =
    location.pathname === '/' ||
    location.pathname === '/home' ||
    location.pathname === '/dashboard';

  const isMap = location.pathname === '/map';

  return (
    <div className="min-h-screen flex flex-col font-display dark:bg-dark-bg dark:text-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
      >
        {t('common.skipToContent') || 'Skip to content'}
      </a>

      {/* Desktop top nav bar */}
      <header className="hidden md:flex relative z-[800] safe-area-top border-b border-input-border dark:border-dark-border bg-background-light dark:bg-dark-surface px-6 py-3">
        <nav className="flex items-center gap-6 w-full max-w-6xl xl:max-w-7xl mx-auto">
          {/* Logo → dashboard */}
          <Link
            to="/home"
            className="flex items-center gap-2 text-lg font-semibold text-primary hover:text-primary-hover transition-colors mr-2"
            aria-label="SoulStep — go to dashboard"
          >
            <img src="/logo.png" className="w-7 h-7 rounded-lg" alt="" />
            {t('common.appName')}
          </Link>

          {/* Explore Map */}
          <Link
            to="/map"
            className={cn(
              'text-text-muted hover:text-primary font-medium transition-colors dark:text-dark-text-secondary text-sm',
              isMap && 'text-primary dark:text-primary',
            )}
          >
            {t('nav.map') || 'Explore Map'}
          </Link>

          {/* Spacer */}
          <span className="flex-1" />

          {/* New Journey — prominent terracotta button */}
          <button
            onClick={() => navigate(user ? '/journeys/new' : '/login')}
            className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors shadow-sm"
          >
            <span
              className="material-symbols-outlined text-[18px]"
              aria-hidden
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              add
            </span>
            {t('journey.newJourney') || 'New Journey'}
          </button>

          {/* Avatar — only when signed in */}
          {user && (
            <div className="relative">
              <Link
                to="/profile"
                className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/20 transition-colors"
                aria-current={location.pathname === '/profile' ? 'page' : undefined}
              >
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full ring-1 ring-white dark:ring-dark-bg" />
                )}
                {user.display_name?.[0]?.toUpperCase() ?? 'U'}
              </Link>
            </div>
          )}
        </nav>
      </header>

      <main
        id="main-content"
        className={cn(
          // safe-area-bottom is intentionally omitted here — it is defined after
          // @tailwind utilities in index.css and would override pb-24.
          // The mobile bottom nav already pads its own safe-area-inset-bottom.
          'flex-1 safe-area-top md:pb-6 w-full max-w-6xl xl:max-w-7xl mx-auto px-0',
          showBottomNav ? 'pb-24' : 'pb-6',
        )}
      >
        {children}
      </main>

      {/* Footer — legal/trust links (hidden on mobile where bottom nav is shown) */}
      <footer className="hidden md:block border-t border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface">
        <div className="max-w-6xl xl:max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-text-secondary dark:text-dark-text-secondary">
          <span>&copy; {new Date().getFullYear()} SoulStep. All rights reserved.</span>
          <nav className="flex flex-wrap items-center gap-4" aria-label="Footer">
            <Link to="/about" className="hover:text-primary transition-colors">
              About
            </Link>
            <Link to="/blog" className="hover:text-primary transition-colors">
              Blog
            </Link>
            <Link to="/privacy" className="hover:text-primary transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-primary transition-colors">
              Terms of Service
            </Link>
            <Link to="/contact" className="hover:text-primary transition-colors">
              Contact
            </Link>
            <Link to="/developers" className="hover:text-primary transition-colors">
              API
            </Link>
          </nav>
        </div>
      </footer>

      {/* Mobile footer — shown above the bottom nav */}
      {showBottomNav && (
        <div className="md:hidden px-4 pb-28 pt-4 border-t border-slate-100 dark:border-dark-border">
          <nav
            className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-text-secondary dark:text-dark-text-secondary"
            aria-label="Footer"
          >
            <Link to="/about" className="hover:text-primary transition-colors">
              About
            </Link>
            <Link to="/blog" className="hover:text-primary transition-colors">
              Blog
            </Link>
            <Link to="/privacy" className="hover:text-primary transition-colors">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-primary transition-colors">
              Terms
            </Link>
            <Link to="/contact" className="hover:text-primary transition-colors">
              Contact
            </Link>
          </nav>
        </div>
      )}

      {/* Mobile minimal bottom bar: Dashboard | [FAB] | Map */}
      {showBottomNav && (
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-[500]"
          aria-label="Main navigation"
        >
          {/* Glass background */}
          <div className="absolute inset-0 bg-white/80 dark:bg-dark-bg/80 backdrop-blur-lg border-t border-white/30 dark:border-white/5" />
          <div className="absolute top-0 left-0 right-0 h-px bg-slate-200/60 dark:bg-white/8" />

          {/* 3-column grid: each col is exactly 1/3 wide, guaranteeing the FAB lands at the true horizontal center */}
          <div className="relative grid grid-cols-3 items-end max-w-md mx-auto pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {/* Col 1: Dashboard */}
            <div className="flex justify-center">
              <Link
                to="/home"
                aria-current={isDashboard ? 'page' : undefined}
                className={cn(
                  'relative flex items-center justify-center py-3 px-6 rounded-xl transition-all duration-200 active:scale-90',
                  isDashboard ? 'text-primary' : 'text-slate-400 dark:text-dark-text-secondary',
                )}
              >
                {isDashboard && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary" />
                )}
                <span
                  className="material-symbols-outlined text-[30px] transition-all duration-200"
                  style={
                    isDashboard
                      ? { fontVariationSettings: "'FILL' 1, 'wght' 600" }
                      : { fontVariationSettings: "'wght' 300" }
                  }
                  aria-hidden
                >
                  home
                </span>
              </Link>
            </div>

            {/* Col 2: FAB — sits in the exact center column */}
            <div className="flex justify-center" style={{ marginBottom: '12px' }}>
              <button
                onClick={() => navigate(user ? '/journeys/new' : '/login')}
                aria-label={t('journey.newJourney') || 'New Journey'}
                className="w-14 h-14 rounded-full bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/30 flex items-center justify-center transition-all duration-200 active:scale-90"
              >
                <span
                  className="material-symbols-outlined text-[30px]"
                  aria-hidden
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  add
                </span>
              </button>
            </div>

            {/* Col 3: Explore Map */}
            <div className="flex justify-center">
              <Link
                to="/map"
                aria-current={isMap ? 'page' : undefined}
                className={cn(
                  'relative flex items-center justify-center py-3 px-6 rounded-xl transition-all duration-200 active:scale-90',
                  isMap ? 'text-primary' : 'text-slate-400 dark:text-dark-text-secondary',
                )}
              >
                {isMap && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary" />
                )}
                <span
                  className="material-symbols-outlined text-[30px] transition-all duration-200"
                  style={
                    isMap
                      ? { fontVariationSettings: "'FILL' 1, 'wght' 600" }
                      : { fontVariationSettings: "'wght' 300" }
                  }
                  aria-hidden
                >
                  explore
                </span>
              </Link>
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}
