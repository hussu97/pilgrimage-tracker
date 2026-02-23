import { THEME_STORAGE_KEY } from '@/lib/constants';

export type Theme = 'light' | 'dark' | 'system';

function getSystemDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const isDark = theme === 'dark' || (theme === 'system' && getSystemDark());
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

export function getStoredTheme(): Theme {
  try {
    const s = localStorage.getItem(THEME_STORAGE_KEY);
    if (s === 'light' || s === 'dark' || s === 'system') return s;
  } catch {}
  return 'system';
}

export function initTheme(): void {
  applyTheme(getStoredTheme());
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getStoredTheme() === 'system') applyTheme('system');
    });
  }
}
