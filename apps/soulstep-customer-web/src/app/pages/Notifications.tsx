import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/app/providers';
import { cn } from '@/lib/utils/cn';
import { getNotifications, markNotificationRead } from '@/lib/api/client';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import type { Notification } from '@/lib/types';
import AdBanner from '@/components/ads/AdBanner';

function notificationIcon(type: string): string {
  if (type.includes('check') || type.includes('check_in')) return 'check_circle';
  if (type.includes('group')) return 'groups';
  if (type.includes('review')) return 'rate_review';
  return 'notifications';
}

function notificationTitle(n: Notification, t: (key: string) => string): string {
  const p = n.payload as Record<string, unknown> | undefined;
  if (p && typeof p.title === 'string') return p.title;
  if (n.type === 'check_in' || n.type?.includes('check')) return t('notifications.typeCheckIn');
  if (n.type?.includes('group')) return t('notifications.typeGroupUpdate');
  return t('notifications.typeDefault');
}

function notificationBody(n: Notification): string {
  const p = n.payload as Record<string, unknown> | undefined;
  if (p && typeof p.body === 'string') return p.body;
  if (p && typeof p.message === 'string') return p.message;
  return '';
}

export default function NotificationsPage() {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchList = useCallback(() => {
    setLoading(true);
    setError('');
    getNotifications(50, 0)
      .then((res) => {
        setNotifications(res.notifications ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleMarkRead = async (notificationCode: string) => {
    try {
      await markNotificationRead(notificationCode);
      setNotifications((prev) =>
        prev.map((n) =>
          n.notification_code === notificationCode
            ? { ...n, read_at: new Date().toISOString() }
            : n,
        ),
      );
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-surface-tint dark:bg-dark-bg max-w-md md:max-w-2xl mx-auto px-4 py-6 pb-24 md:pb-6">
      <header className="mb-6">
        <p className="text-xs text-primary-dark font-semibold uppercase tracking-wider mb-1">
          {t('notifications.updatesLabel')}
        </p>
        <h1 className="text-2xl font-semibold text-text-dark dark:text-white">
          {t('notifications.title')}
        </h1>
      </header>

      {loading && <p className="text-text-muted">{t('common.loading')}</p>}
      {error && <ErrorState message={error} onRetry={fetchList} retryLabel={t('common.retry')} />}
      {!loading && !error && notifications.length === 0 && (
        <EmptyState
          icon="notifications"
          title={t('notifications.empty')}
          description={t('notifications.emptyDesc')}
          action={
            <Link
              to="/home"
              className="inline-block py-2 px-4 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {t('home.explorePlaces')}
            </Link>
          }
        />
      )}
      {!loading && !error && notifications.length > 0 && (
        <>
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li
                key={n.notification_code}
                className={cn(
                  'rounded-2xl border border-input-border dark:border-dark-border overflow-hidden shadow-subtle',
                  n.read_at
                    ? 'bg-surface dark:bg-dark-surface'
                    : 'bg-primary/5 dark:bg-primary/10 border-primary/30',
                )}
              >
                <div className="flex gap-3 p-4">
                  <div className="w-10 h-10 rounded-full bg-soft-blue flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined">{notificationIcon(n.type)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text-main dark:text-white">
                      {notificationTitle(n, t)}
                    </p>
                    {notificationBody(n) && (
                      <p className="text-sm text-text-muted dark:text-dark-text-secondary mt-0.5">
                        {notificationBody(n)}
                      </p>
                    )}
                    <p className="text-xs text-text-muted dark:text-dark-text-secondary mt-2">
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                    </p>
                  </div>
                  {!n.read_at && (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(n.notification_code)}
                      aria-label={t('notifications.markRead')}
                      className="shrink-0 text-primary text-sm font-medium hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      {t('notifications.markRead')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {/* Ad: bottom of notification list */}
          <div className="mt-4">
            <AdBanner slot="notifications-bottom" format="horizontal" />
          </div>
        </>
      )}
    </div>
  );
}
