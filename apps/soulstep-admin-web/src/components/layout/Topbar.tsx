import { useLocation } from "react-router-dom";
import { Menu, Sun, Moon, LogOut } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTheme } from "@/app/providers/ThemeProvider";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/users": "Users",
  "/places": "Places",
  "/reviews": "Reviews",
  "/check-ins": "Check-ins",
  "/groups": "Groups",
  "/scraper": "Scraper",
  "/translations": "Translations",
  "/audit-log": "Audit Log",
  "/app-versions": "App Versions",
  "/place-attributes": "Place Attributes",
  "/content-translations": "Content Translations",
  "/notifications": "Notifications",
  "/seo": "SEO",
};

function getBreadcrumb(pathname: string): string {
  // Match longest prefix first
  for (const [path, label] of Object.entries(ROUTE_LABELS).sort(
    (a, b) => b[0].length - a[0].length
  )) {
    if (pathname === path || pathname.startsWith(path + "/")) {
      return label;
    }
  }
  return "Admin";
}

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const breadcrumb = getBreadcrumb(location.pathname);

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4 bg-white dark:bg-dark-surface border-input-border dark:border-dark-border">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      {/* Breadcrumb */}
      <h1 className="flex-1 text-sm font-semibold text-text-main dark:text-white">
        {breadcrumb}
      </h1>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* User info + logout */}
        {user && (
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-medium text-text-main dark:text-white leading-none">
                {user.display_name}
              </span>
              <span className="text-xs text-text-muted dark:text-dark-text-secondary mt-0.5">
                Admin
              </span>
            </div>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
              {user.display_name.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={logout}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
              aria-label="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
