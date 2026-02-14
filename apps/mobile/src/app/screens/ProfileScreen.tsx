import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, useI18n, useTheme } from '../providers';
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

/** Shown when the user is not authenticated — a login landing page. */
function LoginLanding({ onGetStarted, onSignIn }: { onGetStarted: () => void; onSignIn: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  return (
    <View style={[landingStyles.container, { paddingBottom: insets.bottom }]}>
      {/* Hero image */}
      <View style={landingStyles.heroContainer}>
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1548013146-72479768bada?w=800&auto=format&fit=crop' }}
          style={landingStyles.heroImage}
          resizeMode="cover"
        />
        <View style={landingStyles.heroOverlay} pointerEvents="none" />
      </View>

      {/* Content */}
      <View style={landingStyles.content}>
        <View style={landingStyles.textBlock}>
          <Text style={landingStyles.title}>{t('splash.heroTitle') || t('splash.welcome')}</Text>
          <Text style={landingStyles.tagline}>{t('splash.tagline')}</Text>
        </View>

        <View style={landingStyles.buttons}>
          <TouchableOpacity
            style={landingStyles.primaryButton}
            onPress={onGetStarted}
            activeOpacity={0.85}
          >
            <Text style={landingStyles.primaryButtonText}>{t('splash.getStarted')}</Text>
            <MaterialIcons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={landingStyles.outlineButton}
            onPress={onSignIn}
            activeOpacity={0.85}
          >
            <Text style={landingStyles.outlineButtonText}>{t('splash.signIn') || t('auth.login')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Profile'>>();
  const stackNav = tabNav.getParent();
  const { user } = useAuth();
  const { t } = useI18n();
  const { isDark, setTheme, theme } = useTheme();
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
    else setLoading(false);
  }, [user, fetchData]);

  // Show login landing page when unauthenticated
  if (!user) {
    return (
      <LoginLanding
        onGetStarted={() => stackNav?.navigate('Register' as never)}
        onSignIn={() => stackNav?.navigate('Login' as never)}
      />
    );
  }

  const displayName = user.display_name?.trim() || user.email?.split('@')[0] || '';
  const visits = stats?.visits ?? stats?.placesVisited ?? 0;
  const reviews = stats?.reviews ?? 0;
  const badges = stats?.badges_count ?? 0;
  const joinedStr = formatJoinedDate(user.created_at);
  const religions = user.religions ?? [];
  const primaryReligion = religions[0] ?? 'islam';

  const accountLink = (
    label: string,
    screen: 'EditProfile' | 'CheckInsList' | 'Settings' | 'Favorites',
    iconName: React.ComponentProps<typeof MaterialIcons>['name'],
    iconBg: string,
    isLast = false,
  ) => (
    <TouchableOpacity
      key={screen}
      style={[styles.accountRow, isLast && styles.accountRowLast]}
      onPress={() => {
        if (screen === 'Favorites') stackNav?.navigate('Favorites' as never);
        else stackNav?.navigate(screen as never);
      }}
      activeOpacity={0.7}
    >
      <View style={styles.accountLeft}>
        <View style={[styles.accountIconWrap, { backgroundColor: iconBg }]}>
          <MaterialIcons name={iconName} size={18} color={tokens.colors.iconGrey} />
        </View>
        <Text style={styles.accountLabel}>{label}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={tokens.colors.textMuted} />
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

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.settingsBtn} />
          <Text style={styles.profileTitle}>{t('profile.title')}</Text>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => stackNav?.navigate('Settings' as never)}
          >
            <MaterialIcons name="settings" size={22} color={tokens.colors.iconGrey} />
          </TouchableOpacity>
        </View>

        {/* Avatar + Name */}
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

        {/* Stats */}
        <View style={styles.statsSection}>
          {loading ? (
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

        {/* Faith selector */}
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

        {/* Edit Profile */}
        <TouchableOpacity
          style={styles.editProfileBtn}
          onPress={() => stackNav?.navigate('EditProfile' as never)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="edit" size={16} color="#fff" />
          <Text style={styles.editProfileBtnText}>{t('profile.editProfile')}</Text>
        </TouchableOpacity>

        {/* Account section */}
        <View style={styles.accountSection}>
          <Text style={styles.accountSectionTitle}>{t('profile.account')}</Text>
          <View style={styles.accountCard}>
            {accountLink(t('profile.myCheckIns'), 'CheckInsList', 'assignment', '#ecfdf5')}
            {accountLink(t('profile.favoritePlaces'), 'Favorites', 'favorite', '#fef2f2')}
            <TouchableOpacity
              style={styles.accountRow}
              onPress={() => tabNav.navigate('Groups')}
              activeOpacity={0.7}
            >
              <View style={styles.accountLeft}>
                <View style={[styles.accountIconWrap, { backgroundColor: '#eef2ff' }]}>
                  <MaterialIcons name="group" size={18} color={tokens.colors.iconGrey} />
                </View>
                <Text style={styles.accountLabel}>{t('profile.groupActivity')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={tokens.colors.textMuted} />
            </TouchableOpacity>

            {/* Dark mode toggle */}
            <View style={[styles.accountRow, styles.accountRowLast]}>
              <View style={styles.accountLeft}>
                <View style={[styles.accountIconWrap, { backgroundColor: '#f5f3ff' }]}>
                  <MaterialIcons name="dark-mode" size={18} color={tokens.colors.iconGrey} />
                </View>
                <Text style={styles.accountLabel}>{t('settings.darkMode') || 'Dark Mode'}</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={(val) => setTheme(val ? 'dark' : 'light')}
                trackColor={{ false: tokens.colors.inputBorder, true: tokens.colors.primary }}
                thumbColor="#fff"
              />
            </View>
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
    flexDirection: 'row',
    gap: 8,
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
    paddingVertical: 14,
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
  accountLabel: { fontSize: 15, fontWeight: '500', color: tokens.colors.textMain },
  version: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '600',
    color: tokens.colors.textMuted,
    marginTop: 32,
  },
});

// Styles for the login landing page (unauthenticated state)
const landingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
  },
  heroContainer: {
    height: '55%',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 28,
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  textBlock: { gap: 8 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: tokens.colors.textDark,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  tagline: {
    fontSize: 16,
    color: tokens.colors.textSecondary,
    lineHeight: 24,
  },
  buttons: { gap: 12 },
  primaryButton: {
    backgroundColor: tokens.colors.primary,
    paddingVertical: 16,
    borderRadius: tokens.borderRadius['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    ...tokens.shadow.glass,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButton: {
    paddingVertical: 16,
    borderRadius: tokens.borderRadius['3xl'],
    alignItems: 'center',
    borderWidth: 2,
    borderColor: tokens.colors.primary,
  },
  outlineButtonText: {
    color: tokens.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
