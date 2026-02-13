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
import { useAuth } from '../providers';
import { useI18n } from '../providers';
import { getMyStats } from '../../lib/api/client';
import type { UserStats } from '../../lib/types';
import { tokens } from '../../lib/theme';

const APP_VERSION = '2.4.0';

type MainTabParamList = {
  Home: undefined;
  Favorites: undefined;
  Groups: undefined;
  Profile: undefined;
};

function formatJoinedDate(createdAt: string | undefined): string {
  if (!createdAt) return '';
  try {
    const d = new Date(createdAt);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Profile'>>();
  const stackNav = tabNav.getParent();
  const { user } = useAuth();
  const { t } = useI18n();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await getMyStats();
      setStats(s);
    } catch (e) {
      setStats(null);
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
  const visits = stats?.visits ?? stats?.placesVisited ?? 0;
  const reviews = stats?.reviews ?? 0;
  const badges = stats?.badges_count ?? 0;
  const joinedStr = formatJoinedDate(user.created_at);
  const religions = user.religions ?? [];
  const primaryReligion = religions[0] ?? 'islam';

  const accountLink = (label: string, screen: 'EditProfile' | 'CheckInsList' | 'Settings' | 'Favorites', icon: string, iconBg: string) => (
    <TouchableOpacity
      style={styles.accountRow}
      onPress={() => {
        if (screen === 'Favorites') stackNav?.navigate('Favorites' as never);
        else stackNav?.navigate(screen as never);
      }}
      activeOpacity={0.7}
    >
      <View style={styles.accountLeft}>
        <View style={[styles.accountIconWrap, { backgroundColor: iconBg }]}>
          <Text style={styles.accountIcon}>{icon}</Text>
        </View>
        <Text style={styles.accountLabel}>{label}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: tokens.colors.backgroundLight }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
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
          <View style={styles.settingsBtn} />
          <Text style={styles.profileTitle}>{t('profile.title')}</Text>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => stackNav?.navigate('Settings' as never)}
          >
            <Text style={styles.settingsBtnText}>⚙</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            {user.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <Text style={styles.avatarLetter}>{(displayName || '?').charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          {joinedStr ? (
            <Text style={styles.joined}>
              {t('profile.joined').replace('{date}', joinedStr)}
            </Text>
          ) : null}
        </View>

        <View style={styles.statsSection}>
          {loading && !error ? (
            <ActivityIndicator size="small" color={tokens.colors.primary} style={styles.loader} />
          ) : (
            <View style={styles.statsRow}>
              <View style={styles.statCol}>
                <Text style={styles.statValue}>{visits}</Text>
                <Text style={styles.statLabel}>{t('profile.visits')}</Text>
              </View>
              <View style={[styles.statCol, styles.statColBorder]}>
                <Text style={styles.statValue}>{reviews}</Text>
                <Text style={styles.statLabel}>{t('profile.reviews')}</Text>
              </View>
              <View style={styles.statCol}>
                <Text style={styles.statValue}>{badges}</Text>
                <Text style={styles.statLabel}>{t('profile.badges')}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.faithSection}>
          <View style={styles.faithPill}>
            <TouchableOpacity
              style={[styles.faithBtn, primaryReligion === 'islam' && styles.faithBtnActive]}
              onPress={() => stackNav?.navigate('SelectPath' as never)}
            >
              <Text style={styles.faithIcon}>🕌</Text>
              <Text style={[styles.faithLabel, primaryReligion === 'islam' && styles.faithLabelActive]}>
                {t('common.islam')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.faithBtn, primaryReligion === 'christianity' && styles.faithBtnActive]}
              onPress={() => stackNav?.navigate('SelectPath' as never)}
            >
              <Text style={styles.faithIcon}>⛪</Text>
              <Text style={[styles.faithLabel, primaryReligion === 'christianity' && styles.faithLabelActive]}>
                {t('common.christianity')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.faithBtn, primaryReligion === 'hinduism' && styles.faithBtnActive]}
              onPress={() => stackNav?.navigate('SelectPath' as never)}
            >
              <Text style={styles.faithIcon}>🛕</Text>
              <Text style={[styles.faithLabel, primaryReligion === 'hinduism' && styles.faithLabelActive]}>
                {t('common.hinduism')}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.faithHint}>{t('profile.selectPilgrimagePath')}</Text>
        </View>

        <TouchableOpacity
          style={styles.editProfileBtn}
          onPress={() => stackNav?.navigate('EditProfile' as never)}
          activeOpacity={0.8}
        >
          <Text style={styles.editProfileBtnText}>✎ {t('profile.editProfile')}</Text>
        </TouchableOpacity>

        <View style={styles.accountSection}>
          <Text style={styles.accountSectionTitle}>{t('profile.account')}</Text>
          <View style={styles.accountCard}>
            {accountLink(t('profile.myCheckIns'), 'CheckInsList', '📋', '#ecfdf5')}
            {accountLink(t('profile.favoritePlaces'), 'Favorites', '♥', '#fef2f2')}
            <TouchableOpacity
              style={[styles.accountRow, styles.accountRowLast]}
              onPress={() => tabNav.navigate('Groups')}
              activeOpacity={0.7}
            >
              <View style={styles.accountLeft}>
                <View style={[styles.accountIconWrap, { backgroundColor: '#eef2ff' }]}>
                  <Text style={styles.accountIcon}>◆</Text>
                </View>
                <Text style={styles.accountLabel}>{t('profile.groupActivity')}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.version}>
            {t('profile.version').replace('{version}', APP_VERSION)}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  signInTitle: { fontSize: 18, color: tokens.colors.textMain, textAlign: 'center', marginBottom: 24 },
  signInButton: {
    backgroundColor: tokens.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: tokens.borderRadius.xl,
  },
  signInButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  errorWrap: { paddingHorizontal: 24, paddingVertical: 16, marginBottom: 8 },
  errorText: { color: '#b91c1c', marginBottom: 8 },
  retryButton: { alignSelf: 'flex-start' },
  retryText: { color: tokens.colors.primary, fontWeight: '600' },
  loader: { marginVertical: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  profileTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
  },
  settingsBtnText: { fontSize: 20 },
  avatarSection: { alignItems: 'center', marginBottom: 24, paddingHorizontal: 24 },
  avatarWrap: {
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: tokens.colors.blueTint,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 16,
    ...tokens.shadow.subtle,
  },
  avatar: { width: '100%', height: '100%' },
  avatarLetter: { fontSize: 48, fontWeight: '700', color: tokens.colors.primary },
  displayName: { fontSize: 24, fontWeight: '700', color: tokens.colors.textDark, marginBottom: 4 },
  joined: { fontSize: 12, color: tokens.colors.textMuted, fontWeight: '500' },
  statsSection: { paddingHorizontal: 24, marginBottom: 24 },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.borderRadius['2xl'],
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    paddingVertical: 12,
    ...tokens.shadow.subtle,
  },
  statCol: { flex: 1, alignItems: 'center' },
  statColBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: tokens.colors.inputBorder },
  statValue: { fontSize: 24, fontWeight: '700', color: tokens.colors.textDark },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.colors.textMuted,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  faithSection: { paddingHorizontal: 24, marginBottom: 24 },
  faithPill: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: tokens.borderRadius['2xl'],
    padding: 6,
  },
  faithBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: tokens.borderRadius.xl,
  },
  faithBtnActive: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    ...tokens.shadow.subtle,
  },
  faithLabel: { fontSize: 14, fontWeight: '500', color: tokens.colors.textMuted },
  faithLabelActive: { color: tokens.colors.textDark, fontWeight: '600' },
  faithIcon: { fontSize: 18 },
  faithHint: {
    textAlign: 'center',
    fontSize: 10,
    color: tokens.colors.textMuted,
    marginTop: 8,
    fontWeight: '500',
  },
  editProfileBtn: {
    backgroundColor: '#1e293b',
    marginHorizontal: 24,
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: tokens.borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editProfileBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  accountSection: { paddingHorizontal: 24, paddingBottom: 24 },
  accountSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 12,
    marginLeft: 8,
  },
  accountCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.borderRadius['2xl'],
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    overflow: 'hidden',
    ...tokens.shadow.subtle,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  accountRowLast: { borderBottomWidth: 0 },
  accountLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  accountIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountIcon: { fontSize: 18 },
  accountLabel: { fontSize: 15, fontWeight: '500', color: tokens.colors.textMain },
  chevron: { fontSize: 20, color: tokens.colors.textMuted },
  version: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '600',
    color: tokens.colors.textMuted,
    marginTop: 32,
  },
});
