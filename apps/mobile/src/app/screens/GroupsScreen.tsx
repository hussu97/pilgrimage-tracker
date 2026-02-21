import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroups } from '@/lib/api/client';
import type { Group } from '@/lib/types';
import { useAuth, useI18n, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import { getFullImageUrl } from '@/lib/utils/imageUtils';

type MainTabParamList = {
  Home: undefined;
  Favorites: undefined;
  Groups: undefined;
  Profile: undefined;
};

function formatRelative(iso: string | null | undefined, t: (key: string) => string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffM = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffM / 60);
    const diffD = Math.floor(diffH / 24);
    if (diffM < 1) return t('common.timeJustNow');
    if (diffM < 60) return t('common.timeMinutesAgo').replace('{count}', String(diffM));
    if (diffH < 24) return t('common.timeHoursAgo').replace('{count}', String(diffH));
    if (diffD < 7) return t('common.timeDaysAgo').replace('{count}', String(Math.max(1, diffD)));
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

function progressLevel(sites: number, total: number, t: (key: string) => string): string {
  if (total <= 0) return '';
  const pct = Math.floor((sites / total) * 100);
  if (pct >= 100) return t('groups.progressDone');
  if (pct >= 80) return t('groups.level').replace('{level}', '5');
  if (pct >= 60) return t('groups.level').replace('{level}', '4');
  if (pct >= 40) return t('groups.level').replace('{level}', '3');
  if (pct >= 20) return t('groups.level').replace('{level}', '2');
  if (sites > 0) return t('groups.level').replace('{level}', '1');
  return t('groups.progressNew');
}

function isRecentlyActive(iso: string | null | undefined): boolean {
  if (!iso) return false;
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    return diffMs < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    scroll: { flex: 1 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: textMain,
      letterSpacing: -0.5,
    },
    loader: { marginVertical: 24 },
    errorWrap: { marginBottom: 16 },
    errorText: { color: '#b91c1c', marginBottom: 8 },
    retryButton: { alignSelf: 'flex-start' },
    retryText: { color: tokens.colors.primary, fontWeight: '600' },
    emptyWrap: {
      paddingVertical: 48,
      paddingHorizontal: 24,
      alignItems: 'center',
      borderRadius: tokens.borderRadius['2xl'],
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    emptyIcon: { fontSize: 48, marginBottom: 16, color: textMuted },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: textMain, marginBottom: 8 },
    emptyDesc: { fontSize: 14, color: textMuted, marginBottom: 20, textAlign: 'center' },
    emptyCta: {
      backgroundColor: tokens.colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: tokens.borderRadius.xl,
    },
    emptyCtaText: { color: '#fff', fontWeight: '600' },
    avatarRowSmall: { flexDirection: 'row' },
    rowCard: {
      backgroundColor: surface,
      borderRadius: tokens.borderRadius['2xl'],
      padding: 16,
      borderWidth: 1,
      borderColor: border,
      marginBottom: 12,
      ...tokens.shadow.card,
    },
    completedCard: { opacity: 0.6 },
    rowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    coverImage: {
      width: 48,
      height: 48,
      borderRadius: tokens.borderRadius.xl,
      marginRight: 12,
    },
    coverFallback: {
      width: 48,
      height: 48,
      borderRadius: tokens.borderRadius.xl,
      marginRight: 12,
      backgroundColor: isDark ? tokens.colors.primaryAlphaDark : tokens.colors.softBlue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    coverFallbackText: { fontSize: 24, color: tokens.colors.primary },
    rowLeft: { flex: 1, marginRight: 12, minWidth: 0 },
    rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    rowName: { fontSize: 16, fontWeight: '700', color: textMain, flex: 1 },
    rowDoneIcon: { fontSize: 14, color: tokens.colors.openNow },
    activityDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: tokens.colors.activityGreen,
    },
    rowDescription: { fontSize: 12, color: textMuted, marginBottom: 2 },
    rowLastActive: { fontSize: 12, color: textMuted },
    smallAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? '#2a3a5e' : tokens.colors.softBlue,
      borderWidth: 2,
      borderColor: isDark ? tokens.colors.darkBorder : '#fff',
    },
    smallAvatarPlus: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? '#2a2a2e' : '#f1f5f9',
      borderWidth: 2,
      borderColor: isDark ? tokens.colors.darkBorder : '#fff',
      marginLeft: -8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallAvatarPlusText: { fontSize: 9, fontWeight: '700', color: textMuted },
    rowProgressMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    rowSitesCount: { fontSize: 12, fontWeight: '500', color: textSecondary },
    levelBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: isDark ? '#1a2a4e' : '#eff6ff',
      borderWidth: 1,
      borderColor: 'rgba(59,130,246,0.2)',
    },
    levelBadgeDone: {
      backgroundColor: isDark ? '#1a3a2e' : '#dcfce7',
      borderColor: 'rgba(34,197,94,0.2)',
    },
    levelBadgeNew: {
      backgroundColor: isDark ? '#1a1a3e' : '#eef2ff',
      borderColor: 'rgba(99,102,241,0.2)',
    },
    levelBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: tokens.colors.primary,
      textTransform: 'uppercase',
    },
    levelBadgeTextDone: { color: '#16a34a' },
    levelBadgeTextNew: { color: '#4f46e5' },
    rowBarBg: {
      height: 3,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#f1f5f9',
      borderRadius: 2,
      overflow: 'hidden',
    },
    rowBarFill: {
      height: '100%',
      backgroundColor: tokens.colors.primary,
      borderRadius: 2,
    },
    rowBarFillDone: { backgroundColor: tokens.colors.openNow },
    fab: {
      position: 'absolute',
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...tokens.shadow.elevated,
    },
    fabText: { fontSize: 28, color: '#fff', fontWeight: '300' },
  });
}

export default function GroupsScreen() {
  const insets = useSafeAreaInsets();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Groups'>>();
  const stackNav = tabNav.getParent();
  const { user } = useAuth();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchGroups = useCallback(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    getGroups()
      .then(setGroups)
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [user, t]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    setError('');
    try {
      const data = await getGroups();
      setGroups(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setRefreshing(false);
    }
  }, [user, t]);

  const navToGroup = (groupCode: string) => {
    (
      stackNav as { navigate: (name: 'GroupDetail', params: { groupCode: string }) => void }
    )?.navigate('GroupDetail', { groupCode });
  };
  const navToCreate = () => {
    (stackNav as { navigate: (name: 'CreateGroup') => void })?.navigate('CreateGroup');
  };

  const bg = isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  // Visitor empty state
  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.title}>{t('groups.myGroups')}</Text>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 100,
            flexGrow: 1,
            justifyContent: 'center',
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.emptyWrap, { backgroundColor: surface, borderColor: border }]}>
            <Text style={[styles.emptyIcon, { color: textMuted }]}>◆</Text>
            <Text style={[styles.emptyTitle, { color: textMain }]}>
              {t('groups.loginRequired')}
            </Text>
            <Text style={[styles.emptyDesc, { color: textMuted }]}>
              {t('groups.loginRequiredDesc')}
            </Text>
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={() =>
                (stackNav as { navigate: (name: 'Register') => void })?.navigate('Register')
              }
              activeOpacity={0.8}
            >
              <Text style={styles.emptyCtaText}>{t('splash.getStarted')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.emptyCta,
                {
                  marginTop: 8,
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderColor: tokens.colors.primary,
                },
              ]}
              onPress={() => (stackNav as { navigate: (name: 'Login') => void })?.navigate('Login')}
              activeOpacity={0.8}
            >
              <Text style={[styles.emptyCtaText, { color: tokens.colors.primary }]}>
                {t('auth.login')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>{t('groups.myGroups')}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.colors.primary}
            colors={[tokens.colors.primary]}
          />
        }
      >
        {loading && (
          <ActivityIndicator size="small" color={tokens.colors.primary} style={styles.loader} />
        )}
        {error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchGroups} style={styles.retryButton}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {!loading && !error && groups.length === 0 && (
          <View style={[styles.emptyWrap, { backgroundColor: surface, borderColor: border }]}>
            <Text style={[styles.emptyIcon, { color: textMuted }]}>◆</Text>
            <Text style={[styles.emptyTitle, { color: textMain }]}>{t('groups.noGroupsYet')}</Text>
            <Text style={[styles.emptyDesc, { color: textMuted }]}>
              {t('groups.noGroupsDescription')}
            </Text>
          </View>
        )}

        {!loading && !error && groups.length > 0 && (
          <>
            {groups.map((g) => {
              const total = g.total_sites ?? 0;
              const visited = g.sites_visited ?? 0;
              const pct = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;
              const level = progressLevel(visited, total, t);
              const lastActive = formatRelative(g.last_activity ?? undefined, t);
              const recently = isRecentlyActive(g.last_activity);
              const isDone = level === t('groups.progressDone');
              const isNew = level === t('groups.progressNew');
              const coverUrl = g.cover_image_url ? getFullImageUrl(g.cover_image_url) : null;
              return (
                <TouchableOpacity
                  key={g.group_code}
                  style={[styles.rowCard, isDone && styles.completedCard]}
                  onPress={() => navToGroup(g.group_code)}
                  activeOpacity={0.8}
                >
                  {/* Top row: cover + info + avatars */}
                  <View style={styles.rowTop}>
                    {/* Cover thumbnail */}
                    {coverUrl ? (
                      <ExpoImage
                        source={{ uri: coverUrl }}
                        style={styles.coverImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.coverFallback}>
                        <Text style={styles.coverFallbackText}>◆</Text>
                      </View>
                    )}

                    {/* Name + description + last active */}
                    <View style={styles.rowLeft}>
                      <View style={styles.rowTitleRow}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {g.name}
                        </Text>
                        {recently && (
                          <View
                            style={[
                              styles.activityDot,
                              Platform.OS === 'ios' && {
                                shadowColor: tokens.colors.activityGreen,
                                shadowOffset: { width: 0, height: 0 },
                                shadowOpacity: 0.8,
                                shadowRadius: 4,
                              },
                            ]}
                          />
                        )}
                        {isDone && <Text style={styles.rowDoneIcon}>✓</Text>}
                      </View>
                      {g.description ? (
                        <Text style={styles.rowDescription} numberOfLines={1}>
                          {g.description}
                        </Text>
                      ) : null}
                      <Text style={styles.rowLastActive}>
                        {lastActive
                          ? t('groups.lastActive').replace('{relative}', lastActive)
                          : g.created_at
                            ? `${t('groups.created')} ${new Date(g.created_at).toLocaleDateString()}`
                            : ''}
                      </Text>
                    </View>

                    {/* Member avatars */}
                    <View style={styles.avatarRowSmall}>
                      {[1, 2].slice(0, Math.min(2, g.member_count ?? 0)).map((i) => (
                        <View key={i} style={[styles.smallAvatar, i >= 1 && { marginLeft: -8 }]} />
                      ))}
                      {(g.member_count ?? 0) > 2 && (
                        <View style={styles.smallAvatarPlus}>
                          <Text style={styles.smallAvatarPlusText}>
                            +{(g.member_count ?? 0) - 2}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Sites count + level badge */}
                  <View style={styles.rowProgressMeta}>
                    <Text style={styles.rowSitesCount}>
                      {t('groups.sitesCount')
                        .replace('{visited}', String(visited))
                        .replace('{total}', String(total || '—'))}
                    </Text>
                    {level ? (
                      <View
                        style={[
                          styles.levelBadge,
                          isDone && styles.levelBadgeDone,
                          isNew && styles.levelBadgeNew,
                        ]}
                      >
                        <Text
                          style={[
                            styles.levelBadgeText,
                            isDone && styles.levelBadgeTextDone,
                            isNew && styles.levelBadgeTextNew,
                          ]}
                        >
                          {level}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Progress bar */}
                  <View style={styles.rowBarBg}>
                    <View
                      style={[
                        styles.rowBarFill,
                        { width: `${pct}%` as `${number}%` },
                        isDone && styles.rowBarFillDone,
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 80 }]}
        onPress={navToCreate}
        activeOpacity={0.9}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}
