import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
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
    avatarRowSmall: { flexDirection: 'row' },
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
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 100 }}
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
