import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getNotifications, markNotificationRead } from '../../lib/api/client';
import { useI18n } from '../providers';
import type { Notification } from '../../lib/types';

function notificationIcon(type: string): string {
  if (type.includes('check') || type.includes('check_in')) return '✓';
  if (type.includes('group')) return '◉';
  if (type.includes('review')) return '★';
  return '•';
}

function notificationTitle(n: Notification): string {
  const p = n.payload as Record<string, unknown> | undefined;
  if (p && typeof p.title === 'string') return p.title;
  if (n.type === 'check_in' || (n.type && n.type.includes('check'))) return 'Check-in';
  if (n.type?.includes('group')) return 'Group update';
  return 'Notification';
}

function notificationBody(n: Notification): string {
  const p = n.payload as Record<string, unknown> | undefined;
  if (p && typeof p.body === 'string') return p.body;
  if (p && typeof p.message === 'string') return p.message;
  return '';
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchList = useCallback(() => {
    setLoading(true);
    setError('');
    getNotifications(50, 0)
      .then((res) => setNotifications(res.notifications ?? []))
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
            : n
        )
      );
    } catch {
      // ignore
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
      ]}
    >
      <Text style={styles.sectionLabel}>Updates</Text>
      <Text style={styles.title}>{t('notifications.title')}</Text>

      {loading && (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="small" color="#0d9488" />
          <Text style={styles.muted}>{t('common.loading')}</Text>
        </View>
      )}
      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchList} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!loading && !error && notifications.length === 0 && (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>◉</Text>
          <Text style={styles.emptyTitle}>{t('notifications.empty')}</Text>
          <Text style={styles.emptyDesc}>
            When you get check-ins or group updates, they'll show here.
          </Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => navigation.navigate('Main' as never)}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyCtaText}>Explore places</Text>
          </TouchableOpacity>
        </View>
      )}
      {!loading && !error && notifications.length > 0 && (
        <View style={styles.list}>
          {notifications.map((n) => (
            <View
              key={n.notification_code}
              style={[
                styles.card,
                !n.read_at && styles.cardUnread,
              ]}
            >
              <View style={styles.iconWrap}>
                <Text style={styles.iconText}>{notificationIcon(n.type)}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{notificationTitle(n)}</Text>
                {notificationBody(n) ? (
                  <Text style={styles.cardBodyText}>{notificationBody(n)}</Text>
                ) : null}
                <Text style={styles.cardTime}>
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                </Text>
              </View>
              {!n.read_at ? (
                <TouchableOpacity
                  onPress={() => handleMarkRead(n.notification_code)}
                  style={styles.markRead}
                  activeOpacity={0.8}
                >
                  <Text style={styles.markReadText}>{t('notifications.markRead')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  content: { paddingHorizontal: 24 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0d9488',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 20 },
  loaderWrap: { alignItems: 'center', paddingVertical: 24 },
  muted: { fontSize: 14, color: '#6b7280', marginTop: 8 },
  errorWrap: { marginBottom: 16 },
  errorText: { color: '#c00', marginBottom: 8 },
  retryButton: { alignSelf: 'flex-start' },
  retryText: { color: '#0d9488', fontWeight: '600' },
  emptyWrap: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  emptyIcon: { fontSize: 48, marginBottom: 16, color: '#9ca3af' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#6b7280', marginBottom: 20, textAlign: 'center' },
  emptyCta: { backgroundColor: '#0d9488', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  emptyCtaText: { color: '#fff', fontWeight: '600' },
  list: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  cardUnread: { backgroundColor: 'rgba(13, 148, 136, 0.06)', borderColor: 'rgba(13, 148, 136, 0.3)' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(13, 148, 136, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  iconText: { fontSize: 16, color: '#0d9488', fontWeight: '600' },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  cardBodyText: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  cardTime: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
  markRead: { flexShrink: 0, paddingVertical: 4 },
  markReadText: { fontSize: 13, color: '#0d9488', fontWeight: '600' },
});
