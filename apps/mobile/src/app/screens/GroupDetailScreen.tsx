import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getGroup,
  getGroupLeaderboard,
  getGroupActivity,
} from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import { INVITE_LINK_BASE_URL } from '@/lib/constants';
import { useI18n } from '@/app/providers';
import type { RootStackParamList } from '@/app/navigation';
import type { Group, LeaderboardEntry, ActivityItem } from '@/lib/types';
import { tokens } from '@/lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'GroupDetail'>;
type GroupDetailRoute = RouteProp<RootStackParamList, 'GroupDetail'>;

export default function GroupDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<GroupDetailRoute>();
  const { groupCode } = route.params;
  const { t } = useI18n();
  const [group, setGroup] = useState<Group | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);

  const fetchData = useCallback(async () => {
    if (!groupCode) return;
    setLoading(true);
    setError('');
    try {
      const [g, lb, act] = await Promise.all([
        getGroup(groupCode),
        getGroupLeaderboard(groupCode),
        getGroupActivity(groupCode, 20),
      ]);
      setGroup(g);
      setLeaderboard(Array.isArray(lb) ? lb : []);
      setActivity(Array.isArray(act) ? act : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [groupCode, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const inviteUrl = group?.invite_code
    ? INVITE_LINK_BASE_URL
      ? `${INVITE_LINK_BASE_URL}/join?code=${group.invite_code}`
      : `Join my pilgrimage group with code: ${group.invite_code}`
    : '';

  const handleShareInvite = async () => {
    if (inviteUrl) await shareUrl(group?.name ?? 'Group invite', inviteUrl);
  };

  const topThree = leaderboard.slice(0, 3);
  const restLeaderboard = leaderboard.slice(3);
  const displayLeaderboard = showFullLeaderboard ? leaderboard : restLeaderboard;

  if (!groupCode) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>Missing group.</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Main')}>
          <Text style={styles.link}>{t('nav.groups')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="small" color={tokens.colors.primary} />
        <Text style={styles.muted}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error || !group) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.errorContainer, { paddingTop: insets.top + 24 }]}
      >
        <Text style={styles.errorText}>{error ?? t('groups.notFound')}</Text>
        <TouchableOpacity onPress={fetchData} style={styles.retryButton}>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('Main')}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>{t('nav.groups')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 24,
      }}
    >
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backLink}
        activeOpacity={0.8}
      >
        <Text style={styles.backArrow}>←</Text>
        <Text style={styles.backLabel}>{t('common.back')}</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.memberCount}>
            {group.member_count ?? 0} {t('groups.members')}
          </Text>
        </View>
        {inviteUrl ? (
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareInvite} activeOpacity={0.8}>
            <Text style={styles.shareBtnText}>Share</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {group.description ? (
        <Text style={styles.description}>{group.description}</Text>
      ) : null}

      <Text style={styles.sectionTitle}>{t('groups.leaderboard')}</Text>
      {topThree.length > 0 ? (
        <View style={styles.podium}>
          {topThree[1] ? (
            <View style={styles.podiumItem}>
              <View style={[styles.avatar, styles.avatar2]}>
                <Text style={styles.avatarText}>{(topThree[1].display_name || '?').charAt(0)}</Text>
              </View>
              <Text style={styles.podiumName} numberOfLines={1}>{topThree[1].display_name}</Text>
              <Text style={styles.podiumPlaces}>{topThree[1].places_visited} places</Text>
              <View style={[styles.rankBar, styles.rankBar2]}><Text style={styles.rankNum}>2</Text></View>
            </View>
          ) : null}
          {topThree[0] ? (
            <View style={styles.podiumItem}>
              <View style={[styles.avatar, styles.avatar1]}>
                <Text style={styles.avatarText}>{(topThree[0].display_name || '?').charAt(0)}</Text>
              </View>
              <Text style={styles.podiumName} numberOfLines={1}>{topThree[0].display_name}</Text>
              <Text style={styles.podiumPlaces}>{topThree[0].places_visited} places</Text>
              <View style={[styles.rankBar, styles.rankBar1]}><Text style={styles.rankNum1}>1</Text></View>
            </View>
          ) : null}
          {topThree[2] ? (
            <View style={styles.podiumItem}>
              <View style={[styles.avatar, styles.avatar3]}>
                <Text style={styles.avatarText}>{(topThree[2].display_name || '?').charAt(0)}</Text>
              </View>
              <Text style={styles.podiumName} numberOfLines={1}>{topThree[2].display_name}</Text>
              <Text style={styles.podiumPlaces}>{topThree[2].places_visited} places</Text>
              <View style={[styles.rankBar, styles.rankBar3]}><Text style={styles.rankNum}>3</Text></View>
            </View>
          ) : null}
        </View>
      ) : null}
      {leaderboard.length > 3 ? (
        <TouchableOpacity
          onPress={() => setShowFullLeaderboard((v) => !v)}
          style={styles.viewFull}
        >
          <Text style={styles.viewFullText}>
            {showFullLeaderboard ? t('groups.showLess') : t('groups.viewFullLeaderboard')}
          </Text>
        </TouchableOpacity>
      ) : null}
      {displayLeaderboard.length > 0 ? (
        <View style={styles.leaderList}>
          {displayLeaderboard.map((entry) => (
            <View key={entry.user_code} style={styles.leaderRow}>
              <Text style={styles.leaderRank}>#{entry.rank}</Text>
              <View style={styles.avatarSmall}>
                <Text style={styles.avatarSmallText}>{(entry.display_name || '?').charAt(0)}</Text>
              </View>
              <Text style={styles.leaderName} numberOfLines={1}>{entry.display_name}</Text>
              <Text style={styles.leaderPlaces}>{entry.places_visited} places</Text>
            </View>
          ))}
        </View>
      ) : null}
      {leaderboard.length === 0 ? (
        <Text style={styles.muted}>{t('groups.noLeaderboardData')}</Text>
      ) : null}

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('groups.recentlyVisited')}</Text>
      {activity.length === 0 ? (
        <Text style={styles.muted}>{t('groups.noRecentActivity')}</Text>
      ) : (
        <View style={styles.activityList}>
          {activity.map((item, i) => (
            <TouchableOpacity
              key={`${item.user_code}-${item.place_code}-${item.checked_in_at}-${i}`}
              style={styles.activityRow}
              onPress={() => navigation.navigate('PlaceDetail', { placeCode: item.place_code })}
              activeOpacity={0.8}
            >
              <View style={styles.avatarSmall}>
                <Text style={styles.avatarSmallText}>{(item.display_name || '?').charAt(0)}</Text>
              </View>
              <View style={styles.activityBody}>
                <Text style={styles.activityText}>
                  <Text style={styles.activityBold}>{item.display_name}</Text>
                  {' ' + t('groups.checkedInAt') + ' '}
                  <Text style={styles.activityBold}>{item.place_name}</Text>
                </Text>
                <Text style={styles.activityTime}>
                  {item.checked_in_at ? new Date(item.checked_in_at).toLocaleString() : ''}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.surfaceTint },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorContainer: { paddingHorizontal: 24, alignItems: 'center' },
  errorText: { color: '#b91c1c', marginBottom: 12, textAlign: 'center' },
  retryButton: { marginBottom: 8 },
  retryText: { color: tokens.colors.primary, fontWeight: '600' },
  backButton: { paddingVertical: 12 },
  backButtonText: { color: tokens.colors.textMain, fontWeight: '600' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backArrow: { fontSize: 20, color: tokens.colors.textMuted },
  backLabel: { fontSize: 16, color: tokens.colors.textMuted },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  headerLeft: { flex: 1, minWidth: 0 },
  groupName: { fontSize: 22, fontWeight: '700', color: tokens.colors.textDark },
  memberCount: { fontSize: 14, color: tokens.colors.textMuted, marginTop: 4 },
  shareBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: tokens.borderRadius.xl,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
  },
  shareBtnText: { fontSize: 14, fontWeight: '600', color: tokens.colors.textMain },
  description: { fontSize: 14, color: tokens.colors.textMuted, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: tokens.colors.textDark, marginBottom: 12 },
  podium: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 8, marginBottom: 16 },
  podiumItem: { flex: 1, alignItems: 'center', maxWidth: 100 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  avatar1: { width: 56, height: 56, borderRadius: 28, backgroundColor: tokens.colors.softBlue },
  avatar2: { backgroundColor: 'rgba(251, 191, 36, 0.4)' },
  avatar3: { backgroundColor: 'rgba(251, 191, 36, 0.25)' },
  avatarText: { fontSize: 20, fontWeight: '700', color: tokens.colors.textDark },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.softBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmallText: { fontSize: 14, fontWeight: '600', color: tokens.colors.primary },
  podiumName: { fontSize: 12, fontWeight: '600', color: tokens.colors.textDark },
  podiumPlaces: { fontSize: 11, color: tokens.colors.textMuted, marginBottom: 6 },
  rankBar: { width: '100%', maxWidth: 72, borderRadius: 8, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  rankBar1: { height: 72, backgroundColor: tokens.colors.blueTint },
  rankBar2: { height: 56, backgroundColor: tokens.colors.inputBorder },
  rankBar3: { height: 44, backgroundColor: tokens.colors.inputBorder },
  rankNum: { fontSize: 18, fontWeight: '700', color: tokens.colors.textMuted },
  rankNum1: { fontSize: 18, fontWeight: '700', color: tokens.colors.primary },
  viewFull: { marginBottom: 12 },
  viewFullText: { fontSize: 14, color: tokens.colors.primary, fontWeight: '600' },
  leaderList: { gap: 8 },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: tokens.borderRadius.xl,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    backgroundColor: tokens.colors.surface,
    ...tokens.shadow.subtle,
  },
  leaderRank: { fontSize: 12, color: tokens.colors.textMuted, width: 28 },
  leaderName: { flex: 1, fontSize: 14, fontWeight: '500', color: tokens.colors.textDark },
  leaderPlaces: { fontSize: 12, color: tokens.colors.textMuted },
  activityList: { gap: 8 },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: tokens.borderRadius.xl,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    backgroundColor: tokens.colors.surface,
    ...tokens.shadow.subtle,
  },
  activityBody: { flex: 1, minWidth: 0 },
  activityText: { fontSize: 14, color: tokens.colors.textSecondary },
  activityBold: { fontWeight: '600', color: tokens.colors.textDark },
  activityTime: { fontSize: 12, color: tokens.colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 18, color: tokens.colors.textMuted },
  muted: { fontSize: 14, color: tokens.colors.textMuted, marginVertical: 8 },
  link: { color: tokens.colors.primary, fontWeight: '600' },
});
