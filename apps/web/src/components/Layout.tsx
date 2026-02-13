import { Link, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';

const navItems = [
  { path: '/home', label: 'Explore', icon: 'explore' },
  { path: '/favorites', label: 'Saved', icon: 'bookmark' },
  { path: '/groups', label: 'Pilgrimage', icon: 'groups' },
  { path: '/profile', label: 'Profile', icon: 'person' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col font-display">
      {/* Top nav for desktop (>= 768px) */}
      <header className="hidden md:flex safe-area-top border-b border-input-border bg-background-light px-6 py-4">
        <nav className="flex items-center gap-6 w-full max-w-6xl mx-auto">
          <Link to="/" className="text-xl font-semibold text-primary">Pilgrimage Tracker</Link>
          <Link to="/home" className="text-text-muted hover:text-primary">Explore</Link>
          <Link to="/favorites" className="text-text-muted hover:text-primary">Saved</Link>
          <Link to="/groups" className="text-text-muted hover:text-primary">Groups</Link>
          <Link to="/notifications" className="text-text-muted hover:text-primary" aria-label="Notifications">
            <span className="material-symbols-outlined">notifications</span>
          </Link>
          <Link to="/profile" className="ml-auto text-text-muted hover:text-primary">Profile</Link>
        </nav>
      </header>

      <main className="flex-1 safe-area-top safe-area-bottom pb-20 md:pb-6">
        {children}
      </main>

      {/* Notifications for mobile - in bottom nav area or as floating icon */}
      <Link to="/notifications" className="md:hidden fixed top-4 right-4 z-30 w-10 h-10 rounded-full bg-white shadow flex items-center justify-center" aria-label="Notifications">
        <span className="material-symbols-outlined text-text-main">notifications</span>
      </Link>

      {/* Bottom nav for mobile (< 768px) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 safe-area-bottom bg-background-light border-t border-input-border z-40 py-2 px-2">
        <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
          {navItems.map(({ path, label, icon }) => {
            const isActive = location.pathname === path || (path === '/groups' && location.pathname.startsWith('/groups'));
            return (
            <Link
              key={label}
              to={path}
              className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-colors ${
                isActive ? 'text-primary' : 'text-text-muted hover:text-text-main'
              }`}
            >
              <span className="material-symbols-outlined text-2xl">{icon}</span>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
