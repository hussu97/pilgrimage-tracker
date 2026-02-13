import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getSettings, updateSettings } from '@/api/client';
import type { UserSettings } from '@/types';

const THEME_KEY = 'pilgrimage-theme';

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettings>({});
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const t = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | 'system' | null;
    return t || 'system';
  });

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    if (theme === 'system') {
      const q = window.matchMedia('(prefers-color-scheme: dark)');
      document.documentElement.classList.add(q.matches ? 'dark' : 'light');
    } else {
      document.documentElement.classList.add(theme);
    }
    localStorage.setItem(THEME_KEY, theme);
    updateSettings({ theme }).catch(() => {});
  }, [theme]);

  if (!user) return null;

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      <h1 className="text-xl font-bold text-text-main mb-6">Settings</h1>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-text-main mb-3">Appearance</h2>
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <label className="flex items-center justify-between p-4 border-b border-gray-100 cursor-pointer">
            <span className="text-text-main">Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-text-main mb-3">Preferences</h2>
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <label className="flex items-center justify-between p-4 border-b border-gray-100">
            <span className="text-text-main">Notifications</span>
            <input
              type="checkbox"
              checked={settings.notifications_on !== false}
              onChange={(e) => {
                const v = e.target.checked;
                setSettings((s) => ({ ...s, notifications_on: v }));
                updateSettings({ notifications_on: v }).catch(() => {});
              }}
              className="rounded"
            />
          </label>
          <label className="flex items-center justify-between p-4">
            <span className="text-text-main">Units</span>
            <select
              value={settings.units || 'km'}
              onChange={(e) => {
                const v = e.target.value;
                setSettings((s) => ({ ...s, units: v }));
                updateSettings({ units: v }).catch(() => {});
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="km">Kilometers</option>
              <option value="miles">Miles</option>
            </select>
          </label>
        </div>
      </section>

      <section className="mb-6">
        <Link to="/notifications" className="block p-4 bg-white rounded-2xl border border-gray-200 hover:shadow-sm">
          <span className="font-medium text-text-main">Notifications</span>
          <span className="material-icons float-right text-gray-400">chevron_right</span>
        </Link>
      </section>

      <section className="mb-6">
        <a href="#" className="block p-4 text-text-muted text-sm">About</a>
        <a href="#" className="block p-4 text-text-muted text-sm">Terms of Service</a>
      </section>

      <button
        type="button"
        onClick={() => { if (window.confirm('Log out?')) { logout(); navigate('/'); } }}
        className="w-full py-3 rounded-xl border border-red-200 text-red-600 font-medium"
      >
        Log out
      </button>
    </div>
  );
}
