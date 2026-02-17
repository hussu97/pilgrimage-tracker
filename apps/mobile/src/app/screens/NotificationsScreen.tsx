import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getNotifications, markNotificationRead } from '@/lib/api/client';
import { useI18n, useTheme } from '@/app/providers';
import type { Notification } from '@/lib/types';
import { tokens } from '@/lib/theme';

function notificationIcon(type: string): 'assignment-turned-in' | 'group' | 'star' | 'notifications' {
  if (type.includes('check') || type.includes('check_in')) return 'assignment-turned-in';
  if (type.includes('group')) return 'group';
  if (type.includes('review')) return 'star';
  return 'notifications';
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

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.surfaceTint;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const primary = tokens.colors.primary;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    content: { paddingHorizontal: 24 },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    title: { fontSize: 24, fontWeight: '700', color: textMain, marginBottom: 20 },
    loaderWrap: { alignItems: 'center', paddingVertical: 24 },
    muted: { fontSize: 14, color: textMuted, marginTop: 8 },
    errorWrap: { marginBottom: 16 },
    errorText: { color: '#b91c1c', marginBottom: 8 },
    retryButton: { alignSelf: 'flex-start' },
    retryText: { color: primary, fontWeight: '600' },
    emptyWrap: {
      paddingVertical: 48,
      paddingHorizontal: 24,
      alignItems: 'center',
      borderRadius: tokens.borderRadius['2xl'],
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
      ...tokens.shadow.subtle,
    },
    emptyIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark ? '#2a2a3e' : tokens.colors.blueTint,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: textMain, marginBottom: 8 },
    emptyDesc: { fontSize: 14, color: textMuted, marginBottom: 20, textAlign: 'center' },
    emptyCta: {
      backgroundColor: primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: tokens.borderRadius.xl,
    },
    emptyCtaText: { color: '#fff', fontWeight: '600' },
    list: { gap: 10 },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 16,
      borderRadius: tokens.borderRadius.xl,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
      ...tokens.shadow.subtle,
    },
    cardUnread: {
      backgroundColor: isDark ? '#1e2a3e' : tokens.colors.blueTint,
      borderColor: 'rgba(59, 130, 246, 0.3)',
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? '#2a2a3e' : tokens.colors.softBlue,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      flexShrink: 0,
    },
    cardBody: { flex: 1, minWidth: 0 },
    cardTitle: { fontSize: 15, fontWeight: '600', color: textMain },
    cardBodyText: { fontSize: 14, color: textMuted, marginTop: 4 },
    cardTime: { fontSize: 12, color: textMuted, marginTop: 6 },
    markRead: { flexShrink: 0, paddingVertical: 4 },
    markReadText: { fontSize: 13, color: primary, fontWeight: '600' },
  });
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
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
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <MaterialIcons name="arrow-back" size={20} color={isDark ? '#fff' : tokens.colors.textDark} />
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>{t('notifications.updatesLabel')}</Text>
      <Text style={styles.title}>{t('notifications.title')}</Text>

      {loading && (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="small" color={tokens.colors.primary} />
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
          <View style={styles.emptyIconWrap}>
            <MaterialIcons name="notifications-none" size={28} color={tokens.colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t('notifications.empty')}</Text>
          <Text style={styles.emptyDesc}>
            {t('notifications.emptyDesc')}
          </Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => navigation.navigate('Main' as never)}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyCtaText}>{t('nav.explore')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {!loading && !error && notifications.length > 0 && (
        <View style={styles.list}>
          {notifications.map((n) => (
            <View
              key={n.notification_code}
              style={[styles.card, !n.read_at && styles.cardUnread]}
            >
              <View style={styles.iconWrap}>
                <MaterialIcons
                  name={notificationIcon(n.type)}
                  size={18}
                  color={tokens.colors.primary}
                />
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
