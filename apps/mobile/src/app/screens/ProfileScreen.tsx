import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type MainTabParamList = {
  Home: undefined;
  Favorites: undefined;
  Groups: undefined;
  Profile: undefined;
};
import { useAuth } from '../providers';
import { useI18n } from '../providers';
import { getMyStats, getMyCheckIns } from '../../lib/api/client';
import type { UserStats } from '../../lib/types';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Profile'>>();
  const stackNav = tabNav.getParent();
  const { user } = useAuth();
  const { t } = useI18n();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [checkInCount, setCheckInCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, checkIns] = await Promise.all([getMyStats(), getMyCheckIns()]);
      setStats(s);
      setCheckInCount(Array.isArray(checkIns) ? checkIns.length : 0);
    } catch (e) {
      setStats(null);
      setCheckInCount(0);
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  if (!user) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 100 }]}>
        <Text style={styles.signInTitle}>{t('auth.signInToViewProfile')}</Text>
        <TouchableOpacity
          style={styles.signInButton}
          onPress={() => stackNav?.navigate('Login' as never)}
          activeOpacity={0.8}
        >
          <Text style={styles.signInButtonText}>{t('auth.login')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const displayName = user.display_name?.trim() || user.email?.split('@')[0] || '';

  const linkToStack = (label: string, screen: 'EditProfile' | 'CheckInsList' | 'Settings' | 'Notifications', count?: number | null) => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={() => stackNav?.navigate(screen as never)}
      activeOpacity={0.7}
    >
      <Text style={styles.menuLabel}>{label}</Text>
      {count != null && <Text style={styles.menuCount}>{count}</Text>}
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
  const linkToTab = (label: string, tab: 'Favorites' | 'Groups') => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={() => tabNav.navigate(tab)}
      activeOpacity={0.7}
    >
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }}
    >
      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchData} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <Text style={styles.avatarLetter}>{(displayName || '?').charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <Text style={styles.displayName}>{displayName}</Text>
        {user.email ? <Text style={styles.email}>{user.email}</Text> : null}
        <TouchableOpacity
          style={styles.editLink}
          onPress={() => stackNav?.navigate('EditProfile' as never)}
          activeOpacity={0.8}
        >
          <Text style={styles.editLinkText}>{t('profile.editProfile')}</Text>
        </TouchableOpacity>
      </View>

      {loading && !error ? (
        <ActivityIndicator size="small" color="#0d9488" style={styles.loader} />
      ) : null}
      {!loading && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.stats')}</Text>
          {(stats?.placesVisited ?? 0) === 0 && (stats?.checkInsThisYear ?? 0) === 0 ? (
            <View style={styles.emptyStats}>
              <Text style={styles.emptyStatsTitle}>{t('profile.noVisitsYet')}</Text>
              <Text style={styles.emptyStatsDesc}>{t('profile.noVisitsDescription')}</Text>
              <TouchableOpacity
                style={styles.emptyCta}
                onPress={() => tabNav.navigate('Home')}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyCtaText}>{t('profile.exploreCta')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats?.placesVisited ?? 0}</Text>
                <Text style={styles.statLabel}>{t('profile.placesVisited')}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats?.checkInsThisYear ?? 0}</Text>
                <Text style={styles.statLabel}>{t('profile.checkInsThisYear')}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      <View style={styles.menu}>
        {linkToStack(t('profile.visitedPlaces'), 'CheckInsList', checkInCount ?? undefined)}
        {linkToTab(t('favorites.title'), 'Favorites')}
        {linkToTab(t('nav.groups'), 'Groups')}
        {linkToStack(t('notifications.title'), 'Notifications')}
        {linkToStack(t('settings.title'), 'Settings')}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  centered: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  signInTitle: { fontSize: 18, color: '#374151', textAlign: 'center', marginBottom: 24 },
  signInButton: { backgroundColor: '#0d9488', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  signInButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  errorWrap: { paddingHorizontal: 24, paddingVertical: 16, marginBottom: 8 },
  errorText: { color: '#c00', marginBottom: 8 },
  retryButton: { alignSelf: 'flex-start' },
  retryText: { color: '#0d9488', fontWeight: '600' },
  header: { alignItems: 'center', marginBottom: 24, paddingHorizontal: 24 },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(13, 148, 136, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 12,
  },
  avatar: { width: '100%', height: '100%' },
  avatarLetter: { fontSize: 36, fontWeight: '700', color: '#0d9488' },
  displayName: { fontSize: 24, fontWeight: '600', color: '#111' },
  email: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  editLink: { marginTop: 12 },
  editLinkText: { fontSize: 14, color: '#0d9488', fontWeight: '600' },
  loader: { marginVertical: 16 },
  section: { paddingHorizontal: 24, marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0d9488',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  emptyStats: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
  },
  emptyStatsTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 8 },
  emptyStatsDesc: { fontSize: 14, color: '#6b7280', marginBottom: 16, textAlign: 'center' },
  emptyCta: { backgroundColor: '#0d9488', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  emptyCtaText: { color: '#fff', fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '700', color: '#111' },
  statLabel: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  menu: { paddingHorizontal: 24 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '500', color: '#111' },
  menuCount: { fontSize: 14, color: '#6b7280', marginRight: 8 },
  chevron: { fontSize: 20, color: '#9ca3af' },
});
