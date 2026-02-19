import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroups } from '@/lib/api/client';
import type { Group } from '@/lib/types';
import { useAuth, useI18n, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';

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
    featuredCard: {
      backgroundColor: '#60a5fa',
      borderRadius: tokens.borderRadius['3xl'],
      padding: 24,
      marginBottom: 24,
      overflow: 'hidden',
    },
    featuredBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: tokens.borderRadius.full,
      backgroundColor: 'rgba(255,255,255,0.3)',
      marginBottom: 12,
    },
    featuredBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#fff',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    featuredName: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 4 },
    featuredNext: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 16 },
    featuredProgressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    featuredProgressLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.9)',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    featuredProgressPct: { fontSize: 12, fontWeight: '600', color: '#fff' },
    featuredBarBg: {
      height: 4,
      backgroundColor: 'rgba(0,0,0,0.1)',
      borderRadius: 2,
      overflow: 'hidden',
      marginBottom: 20,
    },
    featuredBarFill: {
      height: '100%',
      backgroundColor: '#fff',
      borderRadius: 2,
    },
    featuredFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    avatarRow: { flexDirection: 'row' },
    avatarRowSmall: { flexDirection: 'row' },
    featuredAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.3)',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.5)',
    },
    featuredAvatarPlus: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.3)',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.5)',
      marginLeft: -12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    featuredAvatarPlusText: { fontSize: 10, fontWeight: '700', color: '#fff' },
    featuredArrow: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    featuredArrowText: { fontSize: 24, color: '#fff', fontWeight: '300' },
    rowCard: {
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: border,
    },
    rowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    rowLeft: { flex: 1, marginRight: 12, minWidth: 0 },
    rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowName: { fontSize: 18, fontWeight: '700', color: textMain, flex: 1 },
    rowDoneIcon: { fontSize: 14, color: tokens.colors.openNow },
    rowLastActive: { fontSize: 13, color: textMuted, marginTop: 2 },
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
    },
    levelBadgeDone: { backgroundColor: isDark ? '#1a3a2e' : '#dcfce7' },
    levelBadgeNew: { backgroundColor: isDark ? '#1a1a3e' : '#eef2ff' },
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

  const featured = groups.find((g) => g.featured);
  const rest = groups.filter((g) => g.group_code !== featured?.group_code);

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
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
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
            <TouchableOpacity style={styles.emptyCta} onPress={navToCreate} activeOpacity={0.8}>
              <Text style={styles.emptyCtaText}>{t('groups.createGroup')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && groups.length > 0 && (
          <>
            {featured && (
              <TouchableOpacity
                style={styles.featuredCard}
                onPress={() => navToGroup(featured.group_code)}
                activeOpacity={0.95}
              >
                <View style={styles.featuredBadge}>
                  <Text style={styles.featuredBadgeText}>{t('groups.featured')}</Text>
                </View>
                <Text style={styles.featuredName}>{featured.name}</Text>
                {featured.next_place_name ? (
                  <Text style={styles.featuredNext}>
                    {t('groups.next')}: {featured.next_place_name}
                  </Text>
                ) : null}
                <View style={styles.featuredProgressHeader}>
                  <Text style={styles.featuredProgressLabel}>{t('groups.currentProgress')}</Text>
                  <Text style={styles.featuredProgressPct}>
                    {featured.total_sites
                      ? Math.round(((featured.sites_visited ?? 0) / featured.total_sites) * 100)
                      : 0}
                    %
                  </Text>
                </View>
                <View style={styles.featuredBarBg}>
                  <View
                    style={[
                      styles.featuredBarFill,
                      {
                        width: `${featured.total_sites ? Math.min(100, Math.round(((featured.sites_visited ?? 0) / featured.total_sites) * 100)) : 0}%`,
                      },
                    ]}
                  />
                </View>
                <View style={styles.featuredFooter}>
                  <View style={styles.avatarRow}>
                    {[1, 2, 3].slice(0, Math.min(3, featured.member_count ?? 0)).map((i) => (
                      <View
                        key={i}
                        style={[styles.featuredAvatar, i >= 1 && { marginLeft: -12 }]}
                      />
                    ))}
                    {(featured.member_count ?? 0) > 3 && (
                      <View style={styles.featuredAvatarPlus}>
                        <Text style={styles.featuredAvatarPlusText}>
                          +{(featured.member_count ?? 0) - 3}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.featuredArrow}>
                    <Text style={styles.featuredArrowText}>›</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {rest.map((g) => {
              const total = g.total_sites ?? 0;
              const visited = g.sites_visited ?? 0;
              const pct = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;
              const level = progressLevel(visited, total, t);
              const lastActive = formatRelative(g.last_activity ?? undefined, t);
              return (
                <TouchableOpacity
                  key={g.group_code}
                  style={styles.rowCard}
                  onPress={() => navToGroup(g.group_code)}
                  activeOpacity={0.8}
                >
                  <View style={styles.rowTop}>
                    <View style={styles.rowLeft}>
                      <View style={styles.rowTitleRow}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {g.name}
                        </Text>
                        {level === 'Done' && <Text style={styles.rowDoneIcon}>✓</Text>}
                      </View>
                      <Text style={styles.rowLastActive}>
                        {lastActive
                          ? t('groups.lastActive').replace('{relative}', lastActive)
                          : g.created_at
                            ? `Created ${new Date(g.created_at).toLocaleDateString()}`
                            : ''}
                      </Text>
                    </View>
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
                          level === 'Done' && styles.levelBadgeDone,
                          level === 'New' && styles.levelBadgeNew,
                        ]}
                      >
                        <Text
                          style={[
                            styles.levelBadgeText,
                            level === 'Done' && styles.levelBadgeTextDone,
                            level === 'New' && styles.levelBadgeTextNew,
                          ]}
                        >
                          {level}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.rowBarBg}>
                    <View
                      style={[
                        styles.rowBarFill,
                        { width: `${pct}%` },
                        level === 'Done' && styles.rowBarFillDone,
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
