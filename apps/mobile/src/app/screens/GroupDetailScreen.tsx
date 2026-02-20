import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getGroup,
  getGroupLeaderboard,
  getGroupActivity,
  getGroupMembers,
  getGroupChecklist,
  leaveGroup,
  deleteGroup,
  removeGroupMember,
  updateMemberRole,
  addPlaceNote,
  deletePlaceNote,
} from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import { INVITE_LINK_BASE_URL } from '@/lib/constants';
import { useAuth, useI18n, useTheme } from '@/app/providers';
import type { RootStackParamList } from '@/app/navigation';
import type {
  Group,
  LeaderboardEntry,
  ActivityItem,
  GroupMember,
  ChecklistResponse,
} from '@/lib/types';
import { tokens } from '@/lib/theme';
import GroupCheckInSheet from '@/components/groups/GroupCheckInSheet';

type Nav = NativeStackNavigationProp<RootStackParamList, 'GroupDetail'>;
type GroupDetailRoute = RouteProp<RootStackParamList, 'GroupDetail'>;
type Tab = 'itinerary' | 'activity' | 'leaderboard' | 'members';

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : tokens.colors.surfaceTint;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;

  return StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: bg },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: bg },
    errorContainer: { paddingHorizontal: 24, alignItems: 'center' },
    errorText: { color: '#b91c1c', marginBottom: 12, textAlign: 'center' },
    retryButton: { marginBottom: 8 },
    retryText: { color: tokens.colors.primary, fontWeight: '600' },
    backButton: { paddingVertical: 12 },
    backButtonText: { color: textMain, fontWeight: '600' },

    // Header
    headerWrap: { paddingHorizontal: 20, paddingBottom: 12 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: textMain },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerIconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    coverImage: { width: '100%', height: 140, borderRadius: 16, marginBottom: 12 },
    groupName: { fontSize: 22, fontWeight: '700', color: textMain, marginBottom: 4 },
    groupMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
      marginBottom: 4,
    },
    metaText: { fontSize: 13, color: textMuted },
    description: { fontSize: 14, color: textSecondary, marginTop: 4 },

    // Tab bar
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingVertical: 4,
      gap: 4,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 10,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 4,
    },
    tabActive: {
      backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)',
    },
    tabText: { fontSize: 12, fontWeight: '600', color: textMuted },
    tabTextActive: { color: tokens.colors.primary },
    tabDivider: { height: 1, backgroundColor: border },

    // Tab content
    tabContent: { paddingHorizontal: 20, paddingBottom: 32 },

    // Progress bars
    progressSection: { marginTop: 16, marginBottom: 20 },
    progressLabel: { fontSize: 13, fontWeight: '600', color: textSecondary, marginBottom: 6 },
    progressRow: { marginBottom: 10 },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: border,
      overflow: 'hidden',
    },
    progressFill: { height: 8, borderRadius: 4, backgroundColor: tokens.colors.primary },
    progressFillPersonal: { backgroundColor: '#34d399' },
    progressStat: { fontSize: 12, color: textMuted, marginTop: 3 },

    // Place item
    placeItem: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      backgroundColor: surface,
      marginBottom: 10,
      overflow: 'hidden',
    },
    placeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      gap: 10,
    },
    placeThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: border },
    placeInfo: { flex: 1, minWidth: 0 },
    placeName: { fontSize: 14, fontWeight: '600', color: textMain },
    placeSubtext: { fontSize: 12, color: textMuted, marginTop: 2 },
    placeStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    checkedBadge: {
      backgroundColor: isDark ? '#1a3a2a' : '#dcfce7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 20,
    },
    checkedText: { fontSize: 11, fontWeight: '600', color: '#16a34a' },
    uncheckedBadge: {
      backgroundColor: border,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 20,
    },
    uncheckedText: { fontSize: 11, fontWeight: '600', color: textMuted },
    placeExpanded: { paddingHorizontal: 12, paddingBottom: 12 },
    divider: { height: 1, backgroundColor: border, marginBottom: 12 },
    checkInBtn: {
      backgroundColor: tokens.colors.primary,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      marginBottom: 12,
    },
    checkInBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    alreadyCheckedBtn: {
      backgroundColor: isDark ? '#1a3a2a' : '#dcfce7',
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      marginBottom: 12,
    },
    alreadyCheckedText: { color: '#16a34a', fontWeight: '600', fontSize: 14 },
    checkedByTitle: { fontSize: 12, fontWeight: '600', color: textMuted, marginBottom: 6 },
    checkedByRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    avatarChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? '#1a2e50' : '#f0f4ff',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 20,
    },
    avatarCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: tokens.colors.softBlue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: { fontSize: 10, fontWeight: '700', color: tokens.colors.primary },
    avatarName: { fontSize: 12, color: textMain },

    // Notes
    notesSection: {},
    notesTitle: { fontSize: 12, fontWeight: '600', color: textMuted, marginBottom: 8 },
    noteItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: border,
    },
    noteContent: { flex: 1, minWidth: 0 },
    noteAuthor: { fontSize: 12, fontWeight: '600', color: textMain, marginBottom: 2 },
    noteText: { fontSize: 13, color: textSecondary },
    noteDeleteBtn: { padding: 2 },
    noteInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    noteInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      fontSize: 13,
      color: textMain,
      backgroundColor: bg,
      height: 40,
    },
    noteAddBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Empty state
    emptyWrap: { alignItems: 'center', paddingVertical: 40 },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: textMuted, marginTop: 12 },
    emptySubtext: { fontSize: 13, color: textMuted, textAlign: 'center', marginTop: 4 },

    // Activity
    activityList: { gap: 8 },
    activityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    avatarSmall: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: tokens.colors.softBlue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarSmallText: { fontSize: 14, fontWeight: '600', color: tokens.colors.primary },
    activityBody: { flex: 1, minWidth: 0 },
    activityText: { fontSize: 14, color: textSecondary },
    activityBold: { fontWeight: '600', color: textMain },
    activityNote: { fontSize: 12, color: textMuted, marginTop: 2, fontStyle: 'italic' },
    activityTime: { fontSize: 12, color: textMuted, marginTop: 2 },
    chevron: { fontSize: 18, color: textMuted },

    // Leaderboard
    podium: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'flex-end',
      gap: 8,
      marginBottom: 16,
    },
    podiumItem: { flex: 1, alignItems: 'center', maxWidth: 100 },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    avatar1: { width: 56, height: 56, borderRadius: 28, backgroundColor: tokens.colors.softBlue },
    avatar2: { backgroundColor: isDark ? '#3a2e1a' : 'rgba(251,191,36,0.4)' },
    avatar3: { backgroundColor: isDark ? '#2a2a1a' : 'rgba(251,191,36,0.25)' },
    avatarText: { fontSize: 20, fontWeight: '700', color: textMain },
    podiumName: { fontSize: 12, fontWeight: '600', color: textMain },
    podiumPlaces: { fontSize: 11, color: textMuted, marginBottom: 6 },
    rankBar: {
      width: '100%',
      maxWidth: 72,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 4,
    },
    rankBar1: { height: 72, backgroundColor: isDark ? '#1a2e50' : tokens.colors.blueTint },
    rankBar2: { height: 56, backgroundColor: border },
    rankBar3: { height: 44, backgroundColor: border },
    rankNum: { fontSize: 18, fontWeight: '700', color: textMuted },
    rankNum1: { fontSize: 18, fontWeight: '700', color: tokens.colors.primary },
    viewFull: { marginBottom: 12 },
    viewFullText: { fontSize: 14, color: tokens.colors.primary, fontWeight: '600' },
    leaderList: { gap: 8 },
    leaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    leaderRank: { fontSize: 12, color: textMuted, width: 28 },
    leaderName: { flex: 1, fontSize: 14, fontWeight: '500', color: textMain },
    leaderPlaces: { fontSize: 12, color: textMuted },

    // Members
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
      marginBottom: 8,
    },
    memberInfo: { flex: 1, minWidth: 0 },
    memberName: { fontSize: 14, fontWeight: '600', color: textMain },
    memberJoined: { fontSize: 12, color: textMuted, marginTop: 2 },
    roleBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 20,
      backgroundColor: isDark ? '#1a2e50' : tokens.colors.softBlue,
    },
    roleBadgeAdmin: {
      backgroundColor: isDark ? '#1a2e50' : '#dbeafe',
    },
    roleText: { fontSize: 11, fontWeight: '600', color: tokens.colors.primary },
    memberActions: { flexDirection: 'row', gap: 6 },
    memberActionBtn: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: border,
    },
    memberActionText: { fontSize: 12, fontWeight: '600', color: textMuted },
    memberActionDanger: { borderColor: '#ef4444' },
    memberActionDangerText: { color: '#ef4444' },
    dangerSection: { marginTop: 20, gap: 10 },
    dangerBtn: {
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#ef4444',
      alignItems: 'center',
    },
    dangerBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },

    muted: { fontSize: 14, color: textMuted, marginVertical: 8 },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: textMain,
      marginBottom: 12,
      marginTop: 4,
    },
  });
}

export default function GroupDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<GroupDetailRoute>();
  const { groupCode } = route.params;
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [activeTab, setActiveTab] = useState<Tab>('itinerary');
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [checklist, setChecklist] = useState<ChecklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedPlaceCode, setExpandedPlaceCode] = useState<string | null>(null);
  const [checkInSheet, setCheckInSheet] = useState({
    visible: false,
    placeCode: '',
    placeName: '',
  });
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [submittingNote, setSubmittingNote] = useState<string | null>(null);
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null);

  const isAdmin = useMemo(
    () => members.some((m) => m.user_code === user?.user_code && m.role === 'admin'),
    [members, user],
  );
  const isCreator = useMemo(() => group?.created_by_user_code === user?.user_code, [group, user]);

  const fetchData = useCallback(async () => {
    if (!groupCode) return;
    setLoading(true);
    setError('');
    try {
      const [g, mems, lb, act] = await Promise.all([
        getGroup(groupCode),
        getGroupMembers(groupCode),
        getGroupLeaderboard(groupCode),
        getGroupActivity(groupCode, 30),
      ]);
      setGroup(g);
      setMembers(Array.isArray(mems) ? mems : []);
      setLeaderboard(Array.isArray(lb) ? lb : []);
      setActivity(Array.isArray(act) ? act : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [groupCode, t]);

  const fetchChecklist = useCallback(async () => {
    if (!groupCode) return;
    setChecklistLoading(true);
    try {
      const data = await getGroupChecklist(groupCode);
      setChecklist(data);
    } catch {
      // silently fail; checklist empty state shown
    } finally {
      setChecklistLoading(false);
    }
  }, [groupCode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === 'itinerary' && checklist === null && !checklistLoading) {
      fetchChecklist();
    }
  }, [activeTab, checklist, checklistLoading, fetchChecklist]);

  const handleAddNote = async (placeCode: string) => {
    const text = noteInputs[placeCode]?.trim();
    if (!text) return;
    setSubmittingNote(placeCode);
    try {
      await addPlaceNote(groupCode, placeCode, text);
      setNoteInputs((prev) => ({ ...prev, [placeCode]: '' }));
      fetchChecklist();
    } catch {
      Alert.alert(t('common.error'), t('common.unexpectedError'));
    } finally {
      setSubmittingNote(null);
    }
  };

  const handleDeleteNote = (noteCode: string) => {
    Alert.alert(t('common.delete'), t('common.confirmDelete'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePlaceNote(groupCode, noteCode);
            fetchChecklist();
          } catch {
            Alert.alert(t('common.error'), t('common.unexpectedError'));
          }
        },
      },
    ]);
  };

  const handleLeaveGroup = () => {
    Alert.alert(t('groups.leaveGroup'), t('groups.confirmLeave'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groups.leaveGroup'),
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroup(groupCode);
            navigation.navigate('Main');
          } catch (err) {
            Alert.alert(
              t('common.error'),
              err instanceof Error ? err.message : t('common.unexpectedError'),
            );
          }
        },
      },
    ]);
  };

  const handleDeleteGroup = () => {
    Alert.alert(t('groups.deleteGroup'), t('groups.confirmDelete'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groups.deleteGroup'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteGroup(groupCode);
            navigation.navigate('Main');
          } catch (err) {
            Alert.alert(
              t('common.error'),
              err instanceof Error ? err.message : t('common.unexpectedError'),
            );
          }
        },
      },
    ]);
  };

  const handleRemoveMember = (targetUserCode: string, displayName: string) => {
    Alert.alert(
      t('groups.removeMember'),
      t('groups.confirmRemove').replace('{name}', displayName),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('groups.removeMember'),
          style: 'destructive',
          onPress: async () => {
            setMemberActionLoading(targetUserCode);
            try {
              await removeGroupMember(groupCode, targetUserCode);
              setMembers((prev) => prev.filter((m) => m.user_code !== targetUserCode));
            } catch (err) {
              Alert.alert(
                t('common.error'),
                err instanceof Error ? err.message : t('common.unexpectedError'),
              );
            } finally {
              setMemberActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const handleToggleRole = async (targetUserCode: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    setMemberActionLoading(targetUserCode);
    try {
      await updateMemberRole(groupCode, targetUserCode, newRole);
      setMembers((prev) =>
        prev.map((m) => (m.user_code === targetUserCode ? { ...m, role: newRole } : m)),
      );
    } catch (err) {
      Alert.alert(
        t('common.error'),
        err instanceof Error ? err.message : t('common.unexpectedError'),
      );
    } finally {
      setMemberActionLoading(null);
    }
  };

  const inviteUrl = group?.invite_code
    ? INVITE_LINK_BASE_URL
      ? `${INVITE_LINK_BASE_URL}/join?code=${group.invite_code}`
      : `${group.invite_code}`
    : '';

  const topThree = leaderboard.slice(0, 3);
  const restLeaderboard = leaderboard.slice(3);
  const displayLeaderboard = showFullLeaderboard ? leaderboard : restLeaderboard;

  if (!groupCode) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>{t('groups.missingGroup')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Main')}>
          <Text style={{ color: tokens.colors.primary, fontWeight: '600' }}>{t('nav.groups')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="small" color={tokens.colors.primary} />
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
        <TouchableOpacity onPress={() => navigation.navigate('Main')} style={styles.backButton}>
          <Text style={styles.backButtonText}>{t('nav.groups')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'itinerary', label: t('groups.itinerary'), icon: 'route' },
    { key: 'activity', label: t('groups.recentlyVisited'), icon: 'history' },
    { key: 'leaderboard', label: t('groups.leaderboard'), icon: 'emoji-events' },
    { key: 'members', label: t('groups.membersTab'), icon: 'group' },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={[styles.headerWrap, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="arrow-back"
                size={20}
                color={isDark ? '#fff' : tokens.colors.textDark}
              />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {group.name}
            </Text>
            <View style={styles.headerActions}>
              {isAdmin ? (
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={() => navigation.navigate('EditGroup', { groupCode })}
                  activeOpacity={0.8}
                >
                  <MaterialIcons
                    name="settings"
                    size={18}
                    color={isDark ? '#fff' : tokens.colors.textDark}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {group.cover_image_url ? (
            <Image
              source={{ uri: group.cover_image_url }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : null}

          <View style={styles.groupMeta}>
            <Text style={styles.metaText}>
              {group.member_count ?? members.length} {t('groups.members')}
            </Text>
            {group.start_date && group.end_date ? (
              <Text style={styles.metaText}>
                {group.start_date} – {group.end_date}
              </Text>
            ) : null}
          </View>
          {group.description ? <Text style={styles.description}>{group.description}</Text> : null}
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name={tab.icon as any}
                size={18}
                color={
                  activeTab === tab.key
                    ? tokens.colors.primary
                    : isDark
                      ? tokens.colors.darkTextSecondary
                      : tokens.colors.textMuted
                }
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.tabDivider} />

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {/* ── ITINERARY TAB ── */}
          {activeTab === 'itinerary' && (
            <>
              {checklistLoading ? (
                <ActivityIndicator color={tokens.colors.primary} style={{ marginTop: 40 }} />
              ) : checklist && checklist.places.length > 0 ? (
                <>
                  {/* Progress bars */}
                  <View style={styles.progressSection}>
                    <View style={styles.progressRow}>
                      <Text style={styles.progressLabel}>{t('groups.groupProgress')}</Text>
                      <View style={styles.progressTrack}>
                        <View
                          style={[styles.progressFill, { width: `${checklist.group_progress}%` }]}
                        />
                      </View>
                      <Text style={styles.progressStat}>
                        {checklist.group_visited} / {checklist.total_places}
                      </Text>
                    </View>
                    <View style={styles.progressRow}>
                      <Text style={styles.progressLabel}>{t('groups.yourProgress')}</Text>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            styles.progressFillPersonal,
                            { width: `${checklist.personal_progress}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressStat}>
                        {checklist.personal_visited} / {checklist.total_places}
                      </Text>
                    </View>
                  </View>

                  {/* Place list */}
                  {checklist.places.map((place, idx) => {
                    const isExpanded = expandedPlaceCode === place.place_code;
                    return (
                      <View key={place.place_code} style={styles.placeItem}>
                        <TouchableOpacity
                          style={styles.placeHeader}
                          onPress={() => setExpandedPlaceCode(isExpanded ? null : place.place_code)}
                          activeOpacity={0.8}
                        >
                          {place.image_url ? (
                            <Image
                              source={{ uri: place.image_url }}
                              style={styles.placeThumb}
                              resizeMode="cover"
                            />
                          ) : (
                            <View
                              style={[
                                styles.placeThumb,
                                { alignItems: 'center', justifyContent: 'center' },
                              ]}
                            >
                              <Text style={{ fontSize: 18, color: tokens.colors.textMuted }}>
                                {idx + 1}
                              </Text>
                            </View>
                          )}
                          <View style={styles.placeInfo}>
                            <Text style={styles.placeName} numberOfLines={1}>
                              {place.name}
                            </Text>
                            {place.address ? (
                              <Text style={styles.placeSubtext} numberOfLines={1}>
                                {place.address}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.placeStatus}>
                            {place.user_checked_in ? (
                              <View style={styles.checkedBadge}>
                                <Text style={styles.checkedText}>{t('groups.checkedIn')}</Text>
                              </View>
                            ) : (
                              <View style={styles.uncheckedBadge}>
                                <Text style={styles.uncheckedText}>
                                  {place.check_in_count > 0 ? `${place.check_in_count}` : '—'}
                                </Text>
                              </View>
                            )}
                            <MaterialIcons
                              name={isExpanded ? 'expand-less' : 'expand-more'}
                              size={20}
                              color={
                                isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted
                              }
                            />
                          </View>
                        </TouchableOpacity>

                        {isExpanded && (
                          <View style={styles.placeExpanded}>
                            <View style={styles.divider} />

                            {/* Check-in button */}
                            {place.user_checked_in ? (
                              <View style={styles.alreadyCheckedBtn}>
                                <Text style={styles.alreadyCheckedText}>
                                  ✓ {t('groups.checkedIn')}
                                </Text>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={styles.checkInBtn}
                                onPress={() =>
                                  setCheckInSheet({
                                    visible: true,
                                    placeCode: place.place_code,
                                    placeName: place.name,
                                  })
                                }
                                activeOpacity={0.8}
                              >
                                <Text style={styles.checkInBtnText}>{t('groups.checkIn')}</Text>
                              </TouchableOpacity>
                            )}

                            {/* Who checked in */}
                            {place.checked_in_by.length > 0 && (
                              <>
                                <Text style={styles.checkedByTitle}>
                                  {t('groups.checkedIn')} ({place.checked_in_by.length})
                                </Text>
                                <View style={styles.checkedByRow}>
                                  {place.checked_in_by.map((ci) => (
                                    <View key={ci.user_code} style={styles.avatarChip}>
                                      <View style={styles.avatarCircle}>
                                        <Text style={styles.avatarInitial}>
                                          {(ci.display_name || '?').charAt(0)}
                                        </Text>
                                      </View>
                                      <Text style={styles.avatarName} numberOfLines={1}>
                                        {ci.display_name}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              </>
                            )}

                            {/* Notes */}
                            <View style={styles.notesSection}>
                              <Text style={styles.notesTitle}>{t('groups.notes')}</Text>
                              {place.notes.map((note) => (
                                <View key={note.note_code} style={styles.noteItem}>
                                  <View style={styles.noteContent}>
                                    <Text style={styles.noteAuthor}>
                                      {note.display_name ?? note.user_code}
                                    </Text>
                                    <Text style={styles.noteText}>{note.text}</Text>
                                  </View>
                                  {(isAdmin || note.user_code === user?.user_code) && (
                                    <TouchableOpacity
                                      style={styles.noteDeleteBtn}
                                      onPress={() => handleDeleteNote(note.note_code)}
                                    >
                                      <MaterialIcons name="close" size={16} color="#ef4444" />
                                    </TouchableOpacity>
                                  )}
                                </View>
                              ))}
                              <View style={styles.noteInputRow}>
                                <TextInput
                                  style={styles.noteInput}
                                  value={noteInputs[place.place_code] ?? ''}
                                  onChangeText={(v) =>
                                    setNoteInputs((prev) => ({ ...prev, [place.place_code]: v }))
                                  }
                                  placeholder={t('groups.notePlaceholder')}
                                  placeholderTextColor={
                                    isDark
                                      ? tokens.colors.darkTextSecondary
                                      : tokens.colors.textMuted
                                  }
                                />
                                <TouchableOpacity
                                  style={styles.noteAddBtn}
                                  onPress={() => handleAddNote(place.place_code)}
                                  disabled={submittingNote === place.place_code}
                                >
                                  {submittingNote === place.place_code ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                  ) : (
                                    <MaterialIcons name="send" size={18} color="#fff" />
                                  )}
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </>
              ) : (
                <View style={styles.emptyWrap}>
                  <MaterialIcons
                    name="map"
                    size={48}
                    color={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
                  />
                  <Text style={styles.emptyTitle}>{t('groups.noPlacesInItinerary')}</Text>
                  {isAdmin ? (
                    <Text style={styles.emptySubtext}>{t('groups.addPlacesToItinerary')}</Text>
                  ) : null}
                </View>
              )}
            </>
          )}

          {/* ── ACTIVITY TAB ── */}
          {activeTab === 'activity' && (
            <>
              {activity.length === 0 ? (
                <Text style={[styles.muted, { marginTop: 24 }]}>
                  {t('groups.noRecentActivity')}
                </Text>
              ) : (
                <View style={[styles.activityList, { marginTop: 16 }]}>
                  {activity.map((item, i) => (
                    <TouchableOpacity
                      key={`${item.user_code}-${item.place_code}-${i}`}
                      style={styles.activityRow}
                      onPress={() =>
                        navigation.navigate('PlaceDetail', { placeCode: item.place_code })
                      }
                      activeOpacity={0.8}
                    >
                      <View style={styles.avatarSmall}>
                        <Text style={styles.avatarSmallText}>
                          {(item.display_name || '?').charAt(0)}
                        </Text>
                      </View>
                      <View style={styles.activityBody}>
                        <Text style={styles.activityText}>
                          <Text style={styles.activityBold}>{item.display_name}</Text>
                          {' ' + t('groups.checkedInAt') + ' '}
                          <Text style={styles.activityBold}>{item.place_name}</Text>
                        </Text>
                        {item.note ? <Text style={styles.activityNote}>{item.note}</Text> : null}
                        <Text style={styles.activityTime}>
                          {item.checked_in_at ? new Date(item.checked_in_at).toLocaleString() : ''}
                        </Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {/* ── LEADERBOARD TAB ── */}
          {activeTab === 'leaderboard' && (
            <>
              {topThree.length > 0 ? (
                <View style={[styles.podium, { marginTop: 16 }]}>
                  {topThree[1] ? (
                    <View style={styles.podiumItem}>
                      <View style={[styles.avatar, styles.avatar2]}>
                        <Text style={styles.avatarText}>
                          {(topThree[1].display_name || '?').charAt(0)}
                        </Text>
                      </View>
                      <Text style={styles.podiumName} numberOfLines={1}>
                        {topThree[1].display_name}
                      </Text>
                      <Text style={styles.podiumPlaces}>
                        {topThree[1].places_visited} {t('groups.places')}
                      </Text>
                      <View style={[styles.rankBar, styles.rankBar2]}>
                        <Text style={styles.rankNum}>2</Text>
                      </View>
                    </View>
                  ) : null}
                  {topThree[0] ? (
                    <View style={styles.podiumItem}>
                      <View style={[styles.avatar, styles.avatar1]}>
                        <Text style={styles.avatarText}>
                          {(topThree[0].display_name || '?').charAt(0)}
                        </Text>
                      </View>
                      <Text style={styles.podiumName} numberOfLines={1}>
                        {topThree[0].display_name}
                      </Text>
                      <Text style={styles.podiumPlaces}>
                        {topThree[0].places_visited} {t('groups.places')}
                      </Text>
                      <View style={[styles.rankBar, styles.rankBar1]}>
                        <Text style={styles.rankNum1}>1</Text>
                      </View>
                    </View>
                  ) : null}
                  {topThree[2] ? (
                    <View style={styles.podiumItem}>
                      <View style={[styles.avatar, styles.avatar3]}>
                        <Text style={styles.avatarText}>
                          {(topThree[2].display_name || '?').charAt(0)}
                        </Text>
                      </View>
                      <Text style={styles.podiumName} numberOfLines={1}>
                        {topThree[2].display_name}
                      </Text>
                      <Text style={styles.podiumPlaces}>
                        {topThree[2].places_visited} {t('groups.places')}
                      </Text>
                      <View style={[styles.rankBar, styles.rankBar3]}>
                        <Text style={styles.rankNum}>3</Text>
                      </View>
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
                        <Text style={styles.avatarSmallText}>
                          {(entry.display_name || '?').charAt(0)}
                        </Text>
                      </View>
                      <Text style={styles.leaderName} numberOfLines={1}>
                        {entry.display_name}
                      </Text>
                      <Text style={styles.leaderPlaces}>
                        {entry.places_visited} {t('groups.places')}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {leaderboard.length === 0 ? (
                <Text style={[styles.muted, { marginTop: 24 }]}>
                  {t('groups.noLeaderboardData')}
                </Text>
              ) : null}
            </>
          )}

          {/* ── MEMBERS TAB ── */}
          {activeTab === 'members' && (
            <View style={{ marginTop: 16 }}>
              {members.map((member) => {
                const isSelf = member.user_code === user?.user_code;
                const isTargetCreator = member.is_creator;
                const actionLoading = memberActionLoading === member.user_code;

                return (
                  <View key={member.user_code} style={styles.memberRow}>
                    <View style={styles.avatarSmall}>
                      <Text style={styles.avatarSmallText}>
                        {(member.display_name || '?').charAt(0)}
                      </Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {member.display_name}
                        {isSelf ? ' (You)' : ''}
                      </Text>
                      {member.joined_at && !isNaN(new Date(member.joined_at).getTime()) && (
                        <Text style={styles.memberJoined}>
                          {new Date(member.joined_at).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                    <View
                      style={[styles.roleBadge, member.role === 'admin' && styles.roleBadgeAdmin]}
                    >
                      <Text style={styles.roleText}>
                        {member.role === 'admin' ? t('groups.admin') : t('groups.member')}
                      </Text>
                    </View>
                    {isAdmin && !isSelf && !isTargetCreator && (
                      <View style={styles.memberActions}>
                        {actionLoading ? (
                          <ActivityIndicator size="small" color={tokens.colors.primary} />
                        ) : (
                          <>
                            <TouchableOpacity
                              style={styles.memberActionBtn}
                              onPress={() => handleToggleRole(member.user_code, member.role)}
                            >
                              <Text style={styles.memberActionText}>
                                {member.role === 'admin'
                                  ? t('groups.demoteMember')
                                  : t('groups.promoteMember')}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.memberActionBtn, styles.memberActionDanger]}
                              onPress={() =>
                                handleRemoveMember(member.user_code, member.display_name)
                              }
                            >
                              <Text style={styles.memberActionDangerText}>✕</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}

              <View style={styles.dangerSection}>
                {!isCreator && (
                  <TouchableOpacity style={styles.dangerBtn} onPress={handleLeaveGroup}>
                    <Text style={styles.dangerBtnText}>{t('groups.leaveGroup')}</Text>
                  </TouchableOpacity>
                )}
                {isCreator && isAdmin && (
                  <TouchableOpacity style={styles.dangerBtn} onPress={handleDeleteGroup}>
                    <Text style={styles.dangerBtnText}>{t('groups.deleteGroup')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Check-in sheet */}
      <GroupCheckInSheet
        visible={checkInSheet.visible}
        groupCode={groupCode}
        placeCode={checkInSheet.placeCode}
        placeName={checkInSheet.placeName}
        onClose={() => setCheckInSheet({ visible: false, placeCode: '', placeName: '' })}
        onSuccess={() => {
          setCheckInSheet({ visible: false, placeCode: '', placeName: '' });
          fetchChecklist();
        }}
      />
    </KeyboardAvoidingView>
  );
}
