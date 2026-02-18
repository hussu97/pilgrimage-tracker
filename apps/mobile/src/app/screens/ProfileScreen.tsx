import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
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
import { useAuth, useI18n, useTheme } from '@/app/providers';
import { getMyStats, updateSettings } from '@/lib/api/client';
import type { UserStats, Religion } from '@/lib/types';
import { tokens } from '@/lib/theme';

const RELIGIONS = [
  { code: 'islam' as const,        emoji: '🕌', labelKey: 'common.islam' },
  { code: 'hinduism' as const,     emoji: '🛕', labelKey: 'common.hinduism' },
  { code: 'christianity' as const, emoji: '⛪', labelKey: 'common.christianity' },
];

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
    // Visitor greeting
    visitorCard: {
      marginHorizontal: 24,
      marginBottom: 24,
      backgroundColor: isDark ? '#1e2a3a' : '#eff6ff',
      borderRadius: tokens.borderRadius['3xl'],
      borderWidth: 1,
      borderColor: isDark ? '#2a3f5c' : '#bfdbfe',
      padding: 20,
      alignItems: 'center',
      gap: 8,
    },
    visitorTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#fff' : tokens.colors.textDark,
      textAlign: 'center',
    },
    visitorDesc: {
      fontSize: 13,
      color: textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    loginBtn: {
      backgroundColor: tokens.colors.primary,
      paddingVertical: 14,
      paddingHorizontal: 32,
      borderRadius: tokens.borderRadius['2xl'],
      alignItems: 'center',
      marginTop: 4,
      width: '100%',
    },
    loginBtnText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '600',
    },
    createAccountLink: {
      marginTop: 4,
      paddingVertical: 8,
      alignItems: 'center',
    },
    createAccountLinkText: {
      fontSize: 14,
      color: tokens.colors.primary,
      fontWeight: '500',
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
    checkCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: isDark ? tokens.colors.darkBorder : '#cbd5e1',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkCircleActive: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    saveButton: {
      backgroundColor: tokens.colors.primary,
      borderRadius: tokens.borderRadius['2xl'],
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 16,
    },
    saveButtonText: {
      color: '#fff',
      fontSize: 15,
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
  const [pathSheetOpen, setPathSheetOpen] = useState(false);
  const [selectedReligions, setSelectedReligions] = useState<Religion[]>([]);

  const styles = useMemo(() => makeStyles(isDark), [isDark]);

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

  const mutedColor = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const iconBg = isDark ? '#2a2a3e' : tokens.colors.blueTint;

  const displayName = user?.display_name?.trim() || user?.email?.split('@')[0] || '';
  const visits = stats?.visits ?? stats?.placesVisited ?? 0;
  const reviews = stats?.reviews ?? 0;
  const joinedStr = user ? formatJoinedDate(user.created_at) : '';
  const religions = user?.religions ?? [];
  const pathSubtext = religions.includes('all')
    ? t('common.allReligions')
    : religions.length > 0
      ? religions.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')
      : t('profile.myPathSubtext');

  const openPathSheet = () => {
    setSelectedReligions(user?.religions ?? []);
    setPathSheetOpen(true);
  };

  const toggleReligion = (code: Religion) => {
    if (code === 'all') {
      setSelectedReligions((prev) => prev.includes('all') ? [] : ['all']);
    } else {
      setSelectedReligions((prev) => {
        const without = prev.filter((r) => r !== 'all' && r !== code);
        return prev.includes(code) ? without : [...without, code];
      });
    }
  };

  const handleSavePath = async () => {
    setPathSheetOpen(false);
    try {
      await updateSettings({ religions: selectedReligions });
      if (user) fetchData();
    } catch { /* ignore */ }
  };

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

        {user ? (
          <>
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
          </>
        ) : (
          /* Visitor greeting card */
          <View style={styles.visitorCard}>
            <MaterialIcons name="explore" size={32} color={tokens.colors.primary} />
            <Text style={styles.visitorTitle}>{t('visitor.loginRequired')}</Text>
            <Text style={styles.visitorDesc}>{t('visitor.loginRequiredDesc')}</Text>
          </View>
        )}

        {/* Preferences section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.preferences')}</Text>
          <View style={styles.card}>
            {/* My Path */}
            <TouchableOpacity
              style={styles.prefRow}
              onPress={openPathSheet}
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

            {/* Notifications — authenticated only */}
            {user ? (
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
            ) : null}

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

        {user ? (
          <>
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
          </>
        ) : (
          /* Visitor auth buttons */
          <View style={{ paddingHorizontal: 24, marginBottom: 8 }}>
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => stackNav?.navigate('Login' as never)}
              activeOpacity={0.85}
            >
              <Text style={styles.loginBtnText}>{t('profile.logIn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.createAccountLink}
              onPress={() => stackNav?.navigate('Register' as never)}
              activeOpacity={0.7}
            >
              <Text style={styles.createAccountLinkText}>{t('visitor.createAccount')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Version */}
        <Text style={styles.version}>
          {t('profile.version').replace('{version}', APP_VERSION)}
        </Text>
      </ScrollView>

      {/* My Path selection bottom sheet */}
      <Modal visible={pathSheetOpen} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setPathSheetOpen(false)}>
          <Pressable
            style={[styles.langSheet, { paddingBottom: insets.bottom + 16 }]}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.langSheetTitle}>{t('profile.myPath')}</Text>
            <Text style={[styles.langRowText, { fontSize: 13, marginBottom: 8 }]}>{t('selectPath.subtitle')}</Text>

            {/* All option */}
            <TouchableOpacity
              style={styles.langRow}
              onPress={() => toggleReligion('all')}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <Text style={{ fontSize: 24 }}>🌍</Text>
                <Text style={[styles.langRowText, selectedReligions.includes('all') && styles.langRowActive]}>
                  {t('common.allReligions')}
                </Text>
              </View>
              <View style={[styles.checkCircle, selectedReligions.includes('all') && styles.checkCircleActive]}>
                {selectedReligions.includes('all') && <MaterialIcons name="check" size={14} color="#fff" />}
              </View>
            </TouchableOpacity>

            {RELIGIONS.map(({ code, emoji, labelKey }) => {
              const isActive = !selectedReligions.includes('all') && selectedReligions.includes(code);
              return (
                <TouchableOpacity
                  key={code}
                  style={styles.langRow}
                  onPress={() => toggleReligion(code)}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                    <Text style={[styles.langRowText, isActive && styles.langRowActive]}>
                      {t(labelKey)}
                    </Text>
                  </View>
                  <View style={[styles.checkCircle, isActive && styles.checkCircleActive]}>
                    {isActive && <MaterialIcons name="check" size={14} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSavePath}
              activeOpacity={0.85}
            >
              <Text style={styles.saveButtonText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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

