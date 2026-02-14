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
  Modal,
  Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, useI18n, useTheme } from '../providers';
import { getMyStats } from '../../lib/api/client';
import type { UserStats } from '../../lib/types';
import { tokens } from '../../lib/theme';

const APP_VERSION =
  Constants.expoConfig?.version ??
  (Constants.manifest as { version?: string } | null)?.version ??
  '1.0.0';

type MainTabParamList = {
  Home: undefined;
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

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const rowBorderColor = isDark ? tokens.colors.darkBorder : '#f1f5f9';
  const textPrimary = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;
  const sectionTitle = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const iconBg = isDark ? '#2a2a3e' : tokens.colors.blueTint;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    scroll: { flex: 1 },
    errorWrap: { paddingHorizontal: 24, paddingVertical: 16 },
    errorText: { color: '#b91c1c', marginBottom: 8 },
    retryButton: { alignSelf: 'flex-start' },
    retryText: { color: tokens.colors.primary, fontWeight: '600' },
    loader: { marginVertical: 16 },
    // Profile header
    profileHeader: {
      paddingHorizontal: 32,
      marginBottom: 28,
    },
    displayName: {
      fontSize: 30,
      fontWeight: '700',
      color: textPrimary,
      letterSpacing: -0.5,
      marginBottom: 8,
    },
    joinedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    joinedText: {
      fontSize: 14,
      color: textMuted,
      fontWeight: '500',
    },
    // Stats grid
    statsGrid: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 24,
      marginBottom: 28,
    },
    statCard: {
      flex: 1,
      backgroundColor: surface,
      borderRadius: tokens.borderRadius['3xl'],
      borderWidth: 1,
      borderColor: border,
      padding: 20,
      ...tokens.shadow.subtle,
    },
    statValue: {
      fontSize: 30,
      fontWeight: '700',
      color: textPrimary,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
    },
    // Section
    section: {
      paddingHorizontal: 24,
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: sectionTitle,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 12,
      marginLeft: 8,
    },
    card: {
      backgroundColor: surface,
      borderRadius: tokens.borderRadius['3xl'],
      borderWidth: 1,
      borderColor: border,
      overflow: 'hidden',
      ...tokens.shadow.subtle,
    },
    // Preference rows
    prefRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: rowBorderColor,
    },
    prefRowLast: {
      borderBottomWidth: 0,
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      flex: 1,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: tokens.borderRadius.xl,
      backgroundColor: iconBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTexts: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: textPrimary,
      marginBottom: 2,
    },
    rowSubtext: {
      fontSize: 12,
      color: textSecondary,
      fontWeight: '400',
    },
    // Account rows (same structure as pref rows)
    accountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: rowBorderColor,
    },
    accountRowLast: {
      borderBottomWidth: 0,
    },
    accountLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: textPrimary,
    },
    // Logout
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 24,
      marginBottom: 8,
      paddingVertical: 14,
    },
    logoutText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#EF4444',
    },
    // Version
    version: {
      textAlign: 'center',
      fontSize: 10,
      fontWeight: '600',
      color: textMuted,
      marginTop: 8,
      marginBottom: 24,
    },
    // Language sheet
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    langSheet: {
      backgroundColor: isDark ? tokens.colors.darkSurface : tokens.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 12,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder,
      alignSelf: 'center',
      marginBottom: 16,
    },
    langSheetTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#fff' : tokens.colors.textDark,
      marginBottom: 12,
    },
    langRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder,
    },
    langRowText: {
      fontSize: 15,
      color: isDark ? '#e0e0e0' : tokens.colors.textDark,
    },
    langRowActive: {
      color: tokens.colors.primary,
      fontWeight: '600',
    },
  });
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Profile'>>();
  const stackNav = tabNav.getParent();
  const { user, logout } = useAuth();
  const { t, locale, languages, setLocale } = useI18n();
  const { isDark, setTheme } = useTheme();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [langSheetOpen, setLangSheetOpen] = useState(false);

  const styles = makeStyles(isDark);

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
  const joinedStr = formatJoinedDate(user.created_at);
  const religions = user.religions ?? [];
  const pathSubtext =
    religions.length > 0
      ? religions.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')
      : t('profile.myPathSubtext');

  const mutedColor = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const iconBg = isDark ? '#2a2a3e' : tokens.colors.blueTint;

  return (
    <View style={[styles.container]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 100 }}
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

        {/* Profile header: name + join date */}
        <View style={styles.profileHeader}>
          <Text style={styles.displayName}>{displayName}</Text>
          {joinedStr ? (
            <View style={styles.joinedRow}>
              <MaterialIcons name="calendar-today" size={14} color={mutedColor} />
              <Text style={styles.joinedText}>
                {t('profile.joined').replace('{date}', joinedStr)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Stats 2-col grid */}
        <View style={styles.statsGrid}>
          {loading ? (
            <ActivityIndicator size="small" color={tokens.colors.primary} style={styles.loader} />
          ) : (
            <>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{visits}</Text>
                <Text style={styles.statLabel}>{t('profile.myCheckIns')}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{reviews}</Text>
                <Text style={styles.statLabel}>{t('profile.reviews')}</Text>
              </View>
            </>
          )}
        </View>

        {/* Preferences section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.preferences')}</Text>
          <View style={styles.card}>
            {/* My Path */}
            <TouchableOpacity
              style={styles.prefRow}
              onPress={() => stackNav?.navigate('SelectPath' as never)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                  <MaterialIcons name="map" size={20} color={tokens.colors.primary} />
                </View>
                <View style={styles.rowTexts}>
                  <Text style={styles.rowTitle}>{t('profile.myPath')}</Text>
                  <Text style={styles.rowSubtext}>{pathSubtext}</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={mutedColor} />
            </TouchableOpacity>

            {/* Language */}
            <TouchableOpacity
              style={styles.prefRow}
              onPress={() => setLangSheetOpen(true)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                  <MaterialIcons name="language" size={20} color={tokens.colors.primary} />
                </View>
                <View style={styles.rowTexts}>
                  <Text style={styles.rowTitle}>{t('profile.language')}</Text>
                  <Text style={styles.rowSubtext}>
                    {languages.find(l => l.code === locale)?.name ?? locale.toUpperCase()}
                  </Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={mutedColor} />
            </TouchableOpacity>

            {/* Notifications */}
            <TouchableOpacity
              style={styles.prefRow}
              onPress={() => stackNav?.navigate('Notifications' as never)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                  <MaterialIcons name="notifications" size={20} color={tokens.colors.primary} />
                </View>
                <View style={styles.rowTexts}>
                  <Text style={styles.rowTitle}>{t('profile.notifications')}</Text>
                  <Text style={styles.rowSubtext}>{t('profile.notificationsSubtext')}</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={mutedColor} />
            </TouchableOpacity>

            {/* Dark Mode toggle — last row, no border */}
            <View style={[styles.prefRow, styles.prefRowLast]}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                  <MaterialIcons name="dark-mode" size={20} color={tokens.colors.primary} />
                </View>
                <Text style={styles.rowTitle}>{t('settings.darkMode')}</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={(val) => setTheme(val ? 'dark' : 'light')}
                trackColor={{ false: tokens.colors.inputBorder, true: tokens.colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.account')}</Text>
          <View style={styles.card}>
            {/* My Check-Ins */}
            <TouchableOpacity
              style={styles.accountRow}
              onPress={() => stackNav?.navigate('CheckInsList' as never)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                  <MaterialIcons name="assignment" size={20} color={tokens.colors.primary} />
                </View>
                <Text style={styles.accountLabel}>{t('profile.myCheckIns')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={mutedColor} />
            </TouchableOpacity>

            {/* Favorites */}
            <TouchableOpacity
              style={[styles.accountRow, styles.accountRowLast]}
              onPress={() => stackNav?.navigate('Favorites' as never)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                  <MaterialIcons name="favorite" size={20} color={tokens.colors.primary} />
                </View>
                <Text style={styles.accountLabel}>{t('profile.favorites')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={mutedColor} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout button */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={async () => { await logout(); }}
          activeOpacity={0.7}
        >
          <MaterialIcons name="logout" size={18} color="#EF4444" />
          <Text style={styles.logoutText}>{t('auth.logout')}</Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.version}>
          {t('profile.version').replace('{version}', APP_VERSION)}
        </Text>
      </ScrollView>

      {/* Language selection bottom sheet */}
      <Modal visible={langSheetOpen} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setLangSheetOpen(false)}>
          <Pressable
            style={[styles.langSheet, { paddingBottom: insets.bottom + 16 }]}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.langSheetTitle}>{t('profile.language')}</Text>
            {languages.map(lang => (
              <TouchableOpacity
                key={lang.code}
                style={styles.langRow}
                onPress={() => { setLocale(lang.code); setLangSheetOpen(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.langRowText, locale === lang.code && styles.langRowActive]}>
                  {lang.name}
                </Text>
                {locale === lang.code && (
                  <MaterialIcons name="check" size={18} color={tokens.colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Styles for the login landing page (unauthenticated state — always light per design)
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
