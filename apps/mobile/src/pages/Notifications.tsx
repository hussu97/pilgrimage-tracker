import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNotifications, markNotificationRead } from '@/api/client';
import type { Notification } from '@/types';

export default function Notifications() {
  const [data, setData] = useState<{ notifications: Notification[]; unread_count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    getNotifications(50, 0)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleMarkRead = async (notificationCode: string) => {
    try {
      await markNotificationRead(notificationCode);
      setData((prev) =>
        prev
          ? {
              ...prev,
              notifications: prev.notifications.map((n) =>
                n.notification_code === notificationCode ? { ...n, read_at: new Date().toISOString() } : n
              ),
              unread_count: Math.max(0, prev.unread_count - 1),
            }
          : null
      );
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-text-main">Notifications</h1>
        <Link to="/settings" className="text-sm text-primary">Settings</Link>
      </div>

      {loading && <p className="text-text-muted">Loading...</p>}
      {error && <p className="text-red-600 mb-4">{error}</p>}

      {!loading && data?.notifications.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100">
          <span className="material-symbols-outlined text-5xl text-gray-300 mb-3">notifications</span>
          <p className="text-text-muted">No notifications yet</p>
        </div>
      )}

      {!loading && data && data.notifications.length > 0 && (
        <ul className="space-y-2">
          {data.notifications.map((n) => (
            <li
              key={n.notification_code}
              className={`p-4 rounded-2xl border cursor-pointer ${n.read_at ? 'bg-white border-gray-200' : 'bg-primary/5 border-primary/20'}`}
              onClick={() => !n.read_at && handleMarkRead(n.notification_code)}
            >
              <p className="text-sm text-text-main">{(n.payload as { title?: string })?.title ?? n.type}</p>
              <p className="text-xs text-text-muted mt-1">{(n.payload as { body?: string })?.body ?? new Date(n.created_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
