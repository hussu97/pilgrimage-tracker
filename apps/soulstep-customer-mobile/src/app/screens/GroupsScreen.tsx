import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Animated,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroups } from '@/lib/api/client';
import type { Group } from '@/lib/types';
import { useAuth, useI18n, useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import JoinJourneyModal from '@/components/groups/JoinJourneyModal';

type MainTabParamList = {
  Home: undefined;
  Favorites: undefined;
  Groups: undefined;
  Profile: undefined;
};

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

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    scroll: { flex: 1 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    headerLeft: { flex: 1 },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: textMain,
      letterSpacing: -0.5,
    },
    countBadge: {
      marginTop: 2,
      fontSize: 12,
      fontWeight: '600',
      color: tokens.colors.primary,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    joinBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(176,86,61,0.15)' : 'rgba(176,86,61,0.1)',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(176,86,61,0.3)' : 'rgba(176,86,61,0.2)',
    },
    joinBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: tokens.colors.primary,
    },
    loader: { marginVertical: 24 },
    errorWrap: { marginBottom: 16, paddingHorizontal: 20 },
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
      marginHorizontal: 20,
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

    // ── Stats banner ──
    statsBanner: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: isDark ? tokens.colors.darkSurface : tokens.colors.surface,
      borderWidth: 1,
      borderColor: border,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
    },
    statDivider: {
      width: 1,
      backgroundColor: border,
      marginVertical: 8,
    },
    statValue: {
      fontSize: 20,
      fontWeight: '800',
      color: tokens.colors.primary,
      letterSpacing: -0.5,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: textMuted,
      marginTop: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    // ── Section header ──
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: textMain,
    },
    sectionBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(176,86,61,0.2)' : 'rgba(176,86,61,0.1)',
    },
    sectionBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: tokens.colors.primary,
    },

    // ── Premium journey card ──
    journeyCard: {
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 20,
      overflow: 'hidden',
      height: 200,
      ...tokens.shadow.cardMd,
    },
    cardImage: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    cardGradientOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '70%',
      backgroundColor: 'rgba(0,0,0,0)',
    },
    cardOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '60%',
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    cardFallback: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: tokens.colors.primary,
    },
    cardFallbackAccent: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: isDark ? 'rgba(176,86,61,0.6)' : 'rgba(176,86,61,0.8)',
    },
    cardContent: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 14,
    },
    cardTopRow: {
      position: 'absolute',
      top: 10,
      left: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    activityDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: tokens.colors.activityGreen,
    },
    levelBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
    },
    levelBadgeDone: {
      backgroundColor: 'rgba(22,163,74,0.3)',
      borderColor: 'rgba(22,163,74,0.5)',
    },
    levelBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#fff',
      textTransform: 'uppercase',
    },
    cardName: {
      fontSize: 18,
      fontWeight: '700',
      color: '#fff',
      marginBottom: 4,
      letterSpacing: -0.3,
    },
    cardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    cardMetaLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardMetaText: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.8)',
    },
    avatarStack: {
      flexDirection: 'row',
    },
    smallAvatar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: isDark ? '#2a3a5e' : tokens.colors.softBlue,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.4)',
      marginLeft: -6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallAvatarFirst: {
      marginLeft: 0,
    },
    smallAvatarPlus: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.3)',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.3)',
      marginLeft: -6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallAvatarPlusText: { fontSize: 8, fontWeight: '700', color: '#fff' },
    progressBarBg: {
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.2)',
      overflow: 'hidden',
      marginBottom: 8,
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: '#fff',
      borderRadius: 2,
    },
    progressBarFillDone: {
      backgroundColor: tokens.colors.openNow,
    },
    cardBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    progressText: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.7)',
    },
    continueBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
    },
    continueBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#fff',
    },
  });
}

// Animated card wrapper
function AnimatedCard({ index, children }: { index: number; children: React.ReactNode }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      delay: index * 100,
      useNativeDriver: true,
    }).start();
    Animated.timing(translateY, {
      toValue: 0,
      duration: 350,
      delay: index * 100,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, translateY, index]);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
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
  const [joinModalVisible, setJoinModalVisible] = useState(false);

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

  // Stats
  const totalVisited = groups.reduce((sum, g) => sum + (g.sites_visited ?? 0), 0);

  // Visitor empty state
  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{t('groups.myGroups')}</Text>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingHorizontal: 0,
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
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{t('groups.myGroups')}</Text>
          {groups.length > 0 && (
            <Text style={styles.countBadge}>
              {groups.length} {groups.length === 1 ? t('groups.journey') : t('groups.journeys')}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => setJoinModalVisible(true)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="group-add" size={14} color={tokens.colors.primary} />
            <Text style={styles.joinBtnText}>{t('journey.joinWithCode')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
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
            <TouchableOpacity style={styles.emptyCta} onPress={navToCreate} activeOpacity={0.8}>
              <Text style={styles.emptyCtaText}>{t('journey.startPlanning')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && groups.length > 0 && (
          <>
            {/* Stats banner */}
            <View style={styles.statsBanner}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{groups.length}</Text>
                <Text style={styles.statLabel}>{t('groups.journeys')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{totalVisited}</Text>
                <Text style={styles.statLabel}>{t('groups.placesVisited')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {groups.reduce((sum, g) => sum + (g.total_sites ?? 0), 0)}
                </Text>
                <Text style={styles.statLabel}>{t('groups.totalSites')}</Text>
              </View>
            </View>

            {/* Section header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('groups.myJourneys')}</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{groups.length}</Text>
              </View>
            </View>

            {/* Journey cards */}
            {groups.map((g, idx) => {
              const total = g.total_sites ?? 0;
              const visited = g.sites_visited ?? 0;
              const pct = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;
              const level = progressLevel(visited, total, t);
              const recently = isRecentlyActive(g.last_activity);
              const isDone = level === t('groups.progressDone');
              const coverUrl = g.cover_image_url ? getFullImageUrl(g.cover_image_url) : null;
              const memberCount = g.member_count ?? 0;

              return (
                <AnimatedCard key={g.group_code} index={idx}>
                  <TouchableOpacity
                    style={styles.journeyCard}
                    onPress={() => navToGroup(g.group_code)}
                    activeOpacity={0.88}
                  >
                    {/* Background image or fallback */}
                    {coverUrl ? (
                      <>
                        <ExpoImage
                          source={{ uri: coverUrl }}
                          style={styles.cardImage}
                          contentFit="cover"
                        />
                        <View style={styles.cardOverlay} />
                      </>
                    ) : (
                      <View
                        style={[styles.cardFallback, { backgroundColor: tokens.colors.primary }]}
                      >
                        <View style={styles.cardFallbackAccent} />
                      </View>
                    )}

                    {/* Top row: activity dot + level badge */}
                    <View style={styles.cardTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
                      </View>
                      {level ? (
                        <View style={[styles.levelBadge, isDone && styles.levelBadgeDone]}>
                          <Text style={styles.levelBadgeText}>{level}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Bottom content */}
                    <View style={styles.cardContent}>
                      <Text style={styles.cardName} numberOfLines={1}>
                        {g.name}
                      </Text>

                      {/* Meta row: member avatars + sites count */}
                      <View style={styles.cardMeta}>
                        <View style={styles.cardMetaLeft}>
                          {/* Avatar stack */}
                          {memberCount > 0 && (
                            <View style={styles.avatarStack}>
                              {[0, 1, 2].slice(0, Math.min(3, memberCount)).map((i) => (
                                <View
                                  key={i}
                                  style={[styles.smallAvatar, i === 0 && styles.smallAvatarFirst]}
                                />
                              ))}
                              {memberCount > 3 && (
                                <View style={styles.smallAvatarPlus}>
                                  <Text style={styles.smallAvatarPlusText}>+{memberCount - 3}</Text>
                                </View>
                              )}
                            </View>
                          )}
                          <Text style={styles.cardMetaText}>
                            {memberCount} {t('groups.members')}
                          </Text>
                        </View>
                        <Text style={styles.cardMetaText}>
                          {visited}/{total} {t('groups.places')}
                        </Text>
                      </View>

                      {/* Progress bar */}
                      <View style={styles.progressBarBg}>
                        <View
                          style={[
                            styles.progressBarFill,
                            { width: `${pct}%` as `${number}%` },
                            isDone && styles.progressBarFillDone,
                          ]}
                        />
                      </View>

                      {/* Bottom: percentage + Continue CTA */}
                      <View style={styles.cardBottom}>
                        <Text style={styles.progressText}>
                          {pct}% {t('groups.completed')}
                        </Text>
                        <TouchableOpacity
                          style={styles.continueBtn}
                          onPress={() => navToGroup(g.group_code)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.continueBtnText}>{t('journey.continueJourney')}</Text>
                          <MaterialIcons name="arrow-forward" size={12} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                </AnimatedCard>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Join Journey Modal */}
      <JoinJourneyModal visible={joinModalVisible} onClose={() => setJoinModalVisible(false)} />
    </View>
  );
}
