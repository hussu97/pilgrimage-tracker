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
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
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
import { useAuth, useFeedback, useI18n, useTheme } from '@/app/providers';
import AdBannerNative from '@/components/ads/AdBannerNative';
import type { RootStackParamList } from '@/app/navigation';
import type {
  Group,
  LeaderboardEntry,
  ActivityItem,
  GroupMember,
  ChecklistResponse,
} from '@/lib/types';
import { tokens } from '@/lib/theme';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import GroupCheckInSheet from '@/components/groups/GroupCheckInSheet';

type Nav = NativeStackNavigationProp<RootStackParamList, 'GroupDetail'>;
type GroupDetailRoute = RouteProp<RootStackParamList, 'GroupDetail'>;
type Tab = 'route' | 'activity' | 'members';

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

    // Hero
    heroContainer: {
      width: '100%',
      height: 200,
      position: 'relative',
      overflow: 'hidden',
    },
    heroCoverImage: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    heroOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    heroFallback: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: tokens.colors.primary,
    },
    heroTopRow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
    },
    glassBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.35)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    glassBtnIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(0,0,0,0.35)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroBtnRow: {
      flexDirection: 'row',
      gap: 8,
    },
    glassBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    heroBottomRow: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    heroNameWrap: { flex: 1, marginRight: 12 },
    heroName: { fontSize: 20, fontWeight: '700', color: '#fff', lineHeight: 26 },
    heroMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 4,
      flexWrap: 'wrap',
    },
    heroMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
    progressWrap: { alignItems: 'center' },
    progressPct: {
      fontSize: 12,
      fontWeight: '700',
      color: '#fff',
      position: 'absolute',
      alignSelf: 'center',
    },
    progressLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

    // Description strip
    descriptionStrip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 4,
    },
    descriptionText: { flex: 1, fontSize: 13, color: textSecondary },
    mapBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: tokens.colors.primary,
    },
    mapBtnText: { fontSize: 12, fontWeight: '600', color: tokens.colors.primary },

    // Header (fallback when no cover image)
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

    // Tab bar (pill style with underline indicator)
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 0,
      gap: 4,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 9,
      borderRadius: 10,
    },
    tabActive: {
      backgroundColor: isDark ? 'rgba(176,86,61,0.15)' : 'rgba(176,86,61,0.08)',
    },
    tabText: { fontSize: 12, fontWeight: '600', color: textMuted },
    tabTextActive: { color: tokens.colors.primary },
    tabDivider: { height: 1, backgroundColor: border, marginTop: 4 },

    // Tab content
    tabContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },

    // Progress bars
    progressSection: { marginBottom: 20 },
    progressBarLabel: { fontSize: 13, fontWeight: '600', color: textSecondary, marginBottom: 6 },
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

    // Timeline itinerary
    timelineList: {},
    timelineRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 10,
    },
    timelineLeft: {
      width: 32,
      alignItems: 'center',
    },
    timelineBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      zIndex: 1,
    },
    timelineBadgeVisited: {
      backgroundColor: tokens.colors.openNow,
      borderColor: tokens.colors.openNow,
    },
    timelineBadgeUnvisited: {
      backgroundColor: surface,
      borderColor: tokens.colors.primary,
    },
    timelineBadgeNumber: { fontSize: 12, fontWeight: '700', color: tokens.colors.primary },
    timelineLine: {
      flex: 1,
      width: 2,
      backgroundColor: border,
      marginTop: 2,
      alignSelf: 'center',
      minHeight: 12,
    },
    timelineCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      backgroundColor: surface,
      overflow: 'hidden',
      marginBottom: 2,
    },
    placeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      gap: 10,
    },
    placeThumb: {
      width: 44,
      height: 44,
      borderRadius: 8,
      backgroundColor: border,
    },
    placeInfo: { flex: 1, minWidth: 0 },
    placeName: { fontSize: 13, fontWeight: '600', color: textMain },
    placeSubtext: { fontSize: 11, color: textMuted, marginTop: 2 },
    placeAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
    placeAvatarChip: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: isDark ? tokens.colors.primaryAlphaDark : tokens.colors.softBlue,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -3,
    },
    placeAvatarInitial: { fontSize: 7, fontWeight: '700', color: tokens.colors.primary },
    placeCheckedCount: { fontSize: 9, color: textMuted, marginLeft: 4 },
    checkInInlineBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: tokens.colors.primary,
    },
    checkInInlineBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },
    placeExpanded: { paddingHorizontal: 10, paddingBottom: 10 },
    divider: { height: 1, backgroundColor: border, marginBottom: 10 },
    actionRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    detailsBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: tokens.colors.primary,
    },
    detailsBtnText: { color: tokens.colors.primary, fontWeight: '600', fontSize: 13 },
    checkInBtn: {
      flex: 1,
      backgroundColor: tokens.colors.primary,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
    },
    checkInBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    alreadyCheckedBtn: {
      backgroundColor: isDark ? '#1a3a2a' : '#dcfce7',
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      marginBottom: 10,
    },
    alreadyCheckedText: { color: '#16a34a', fontWeight: '600', fontSize: 13 },
    checkedByTitle: { fontSize: 11, fontWeight: '600', color: textMuted, marginBottom: 6 },
    checkedByRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
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
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: tokens.colors.softBlue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: { fontSize: 9, fontWeight: '700', color: tokens.colors.primary },
    avatarName: { fontSize: 11, color: textMain },

    // Notes
    notesSection: {},
    notesTitle: { fontSize: 11, fontWeight: '600', color: textMuted, marginBottom: 8 },
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
    noteAuthor: { fontSize: 11, fontWeight: '600', color: textMain, marginBottom: 2 },
    noteText: { fontSize: 12, color: textSecondary },
    noteDeleteBtn: { padding: 2 },
    noteInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    noteInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
      fontSize: 12,
      color: textMain,
      backgroundColor: bg,
      height: 38,
    },
    noteAddBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
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
    avatar1: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark ? tokens.colors.goldRankDark : tokens.colors.goldRankLight,
      borderWidth: 2,
      borderColor: tokens.colors.goldRank,
    },
    avatar2: {
      backgroundColor: isDark ? tokens.colors.darkSurface : tokens.colors.surface,
      borderWidth: 2,
      borderColor: isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder,
    },
    avatar3: {
      backgroundColor: isDark ? tokens.colors.bronzeRankDark : tokens.colors.bronzeRankLight,
      borderWidth: 2,
      borderColor: tokens.colors.bronzeRank,
    },
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
    rankBar1: {
      height: 72,
      backgroundColor: isDark ? tokens.colors.goldRankDark : tokens.colors.goldRankLight,
    },
    rankBar2: {
      height: 56,
      backgroundColor: isDark ? tokens.colors.darkBorder : tokens.colors.silverLight,
    },
    rankBar3: {
      height: 44,
      backgroundColor: isDark ? tokens.colors.bronzeRankDark : tokens.colors.bronzeRankLight,
    },
    rankNum: { fontSize: 18, fontWeight: '700', color: textMuted },
    rankNum1: { fontSize: 18, fontWeight: '700', color: tokens.colors.goldRankNum },
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
    inviteSection: {
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: border,
    },
    inviteLabel: { fontSize: 12, color: textMuted, marginBottom: 8 },
    inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    inviteUrl: {
      flex: 1,
      fontSize: 11,
      color: textSecondary,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: surface,
    },
    inviteShareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: tokens.colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    inviteShareText: { color: '#fff', fontSize: 12, fontWeight: '600' },

    muted: { fontSize: 14, color: textMuted, marginVertical: 8 },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: textMain,
      marginBottom: 12,
      marginTop: 4,
    },

    // Glass contextual bottom bar
    glassBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    glassBarInner: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(36,36,36,0.88)' : 'rgba(255,255,255,0.88)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)',
      // shadow
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 8,
    },
    glassBarBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: tokens.colors.primary,
    },
    glassBarBtnOutline: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: tokens.colors.primary,
      backgroundColor: 'transparent',
    },
    glassBarBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    glassBarBtnTextOutline: { color: tokens.colors.primary, fontSize: 13, fontWeight: '700' },
  });
}

// Simple circular progress ring using SVG-free approach (two arcs via border)
function CircularProgress({ pct, size = 56 }: { pct: number; size?: number }) {
  // We'll just render a text-based badge since RN doesn't support SVG natively without a package
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: '#fff',
          borderTopColor: pct >= 25 ? '#fff' : 'transparent',
          borderRightColor: pct >= 50 ? '#fff' : 'transparent',
          borderBottomColor: pct >= 75 ? '#fff' : 'transparent',
          borderLeftColor: pct >= 100 ? '#fff' : 'transparent',
        }}
      />
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{pct}%</Text>
    </View>
  );
}

export default function GroupDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<GroupDetailRoute>();
  const { groupCode } = route.params;
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { showSuccess, showError } = useFeedback();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [activeTab, setActiveTab] = useState<Tab>('route');
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
  const [refreshing, setRefreshing] = useState(false);

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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), fetchChecklist()]);
    setRefreshing(false);
  }, [fetchData, fetchChecklist]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === 'route' && checklist === null && !checklistLoading) {
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
      showSuccess(t('feedback.noteSaved'));
    } catch {
      showError(t('feedback.error'));
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
            showSuccess(t('feedback.noteDeleted'));
          } catch {
            showError(t('feedback.error'));
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
            showSuccess(t('feedback.groupLeft'));
            setTimeout(() => navigation.navigate('Main'), 400);
          } catch {
            showError(t('feedback.error'));
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
            showSuccess(t('feedback.groupDeleted'));
            setTimeout(() => navigation.navigate('Main'), 400);
          } catch {
            showError(t('feedback.error'));
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
              showSuccess(t('feedback.memberRemoved'));
            } catch {
              showError(t('feedback.error'));
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
      showSuccess(t('feedback.roleUpdated'));
    } catch {
      showError(t('feedback.error'));
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

  // Compute progress percentage
  const pct = useMemo(() => {
    if (group && (group.total_sites ?? 0) > 0) {
      return Math.round(((group.sites_visited ?? 0) / (group.total_sites ?? 1)) * 100);
    }
    if (checklist && checklist.total_places > 0) {
      return checklist.group_progress;
    }
    return 0;
  }, [group, checklist]);

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

  if (loading && !refreshing) {
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

  const TABS: { key: Tab; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
    { key: 'route', label: t('groups.itinerary'), icon: 'route' },
    { key: 'activity', label: t('groups.recentlyVisited'), icon: 'history' },
    { key: 'members', label: t('groups.membersTab'), icon: 'group' },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.colors.primary}
            colors={[tokens.colors.primary]}
          />
        }
      >
        {/* ── HERO SECTION ── */}
        <View style={[styles.heroContainer, { height: 200 + insets.top }]}>
          {group.cover_image_url ? (
            <>
              <ExpoImage
                source={{ uri: getFullImageUrl(group.cover_image_url) }}
                style={[styles.heroCoverImage, { top: 0, height: 200 + insets.top }]}
                contentFit="cover"
              />
              <View style={[styles.heroOverlay, { top: 0, height: 200 + insets.top }]} />
            </>
          ) : (
            <View style={[styles.heroFallback, { top: 0, height: 200 + insets.top }]} />
          )}

          {/* Top row: back + action buttons */}
          <View style={[styles.heroTopRow, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity
              style={styles.glassBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <MaterialIcons name="arrow-back" size={16} color="#fff" />
              <Text style={styles.glassBtnText}>{t('common.back')}</Text>
            </TouchableOpacity>
            <View style={styles.heroBtnRow}>
              {isAdmin ? (
                <TouchableOpacity
                  style={styles.glassBtnIcon}
                  onPress={() => navigation.navigate('EditGroup', { groupCode })}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="settings" size={17} color="#fff" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.glassBtnIcon}
                onPress={() => shareUrl(group.name, inviteUrl || '')}
                activeOpacity={0.8}
              >
                <MaterialIcons name="share" size={17} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom row: journey name + progress ring */}
          <View style={[styles.heroBottomRow]}>
            <View style={styles.heroNameWrap}>
              <Text style={styles.heroName} numberOfLines={2}>
                {group.name}
              </Text>
              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaText}>
                  {group.member_count ?? members.length} {t('groups.members')}
                </Text>
                {group.start_date && group.end_date ? (
                  <Text style={styles.heroMetaText}>
                    {group.start_date} – {group.end_date}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.progressWrap}>
              <CircularProgress pct={pct} size={52} />
              <Text style={styles.progressLabel}>{t('groups.groupProgress')}</Text>
            </View>
          </View>
        </View>

        {/* Description + map button */}
        {(group.description ?? false) ? (
          <View style={styles.descriptionStrip}>
            <Text style={styles.descriptionText}>{group.description}</Text>
          </View>
        ) : null}

        {/* ── TAB BAR ── */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name={tab.icon}
                size={16}
                color={
                  activeTab === tab.key
                    ? tokens.colors.primary
                    : isDark
                      ? tokens.colors.darkTextSecondary
                      : tokens.colors.textMuted
                }
              />
              <Text
                style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.tabDivider} />

        {/* ── TAB CONTENT ── */}
        <View style={styles.tabContent}>
          {/* ROUTE TAB */}
          {activeTab === 'route' && (
            <>
              {checklistLoading ? (
                <ActivityIndicator color={tokens.colors.primary} style={{ marginTop: 40 }} />
              ) : checklist && checklist.places.length > 0 ? (
                <>
                  {/* Progress bars */}
                  <View style={styles.progressSection}>
                    <View style={styles.progressRow}>
                      <Text style={styles.progressBarLabel}>{t('groups.groupProgress')}</Text>
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
                      <Text style={styles.progressBarLabel}>{t('groups.yourProgress')}</Text>
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

                  {/* Timeline place list */}
                  <View style={styles.timelineList}>
                    {checklist.places.map((place, idx) => {
                      const isExpanded = expandedPlaceCode === place.place_code;
                      const isLast = idx === checklist.places.length - 1;
                      return (
                        <View key={place.place_code} style={styles.timelineRow}>
                          {/* Left: badge + connecting line */}
                          <View style={styles.timelineLeft}>
                            <View
                              style={[
                                styles.timelineBadge,
                                place.user_checked_in
                                  ? styles.timelineBadgeVisited
                                  : styles.timelineBadgeUnvisited,
                              ]}
                            >
                              {place.user_checked_in ? (
                                <MaterialIcons name="check" size={14} color="#fff" />
                              ) : (
                                <Text style={styles.timelineBadgeNumber}>{idx + 1}</Text>
                              )}
                            </View>
                            {!isLast && <View style={styles.timelineLine} />}
                          </View>

                          {/* Right: place card */}
                          <View style={styles.timelineCard}>
                            <TouchableOpacity
                              style={styles.placeHeader}
                              onPress={() =>
                                setExpandedPlaceCode(isExpanded ? null : place.place_code)
                              }
                              activeOpacity={0.8}
                            >
                              {/* Thumbnail */}
                              {place.image_url ? (
                                <ExpoImage
                                  source={{ uri: getFullImageUrl(place.image_url) }}
                                  style={styles.placeThumb}
                                  contentFit="cover"
                                />
                              ) : null}

                              {/* Info */}
                              <View style={styles.placeInfo}>
                                <Text style={styles.placeName} numberOfLines={1}>
                                  {place.name}
                                </Text>
                                {place.address ? (
                                  <Text style={styles.placeSubtext} numberOfLines={1}>
                                    {place.address}
                                  </Text>
                                ) : null}
                                {place.check_in_count > 0 && (
                                  <View style={styles.placeAvatarRow}>
                                    {place.checked_in_by.slice(0, 3).map((ci) => (
                                      <View key={ci.user_code} style={styles.placeAvatarChip}>
                                        <Text style={styles.placeAvatarInitial}>
                                          {ci.display_name.charAt(0)}
                                        </Text>
                                      </View>
                                    ))}
                                    <Text style={styles.placeCheckedCount}>
                                      {place.check_in_count} {t('groups.checkedIn')}
                                    </Text>
                                  </View>
                                )}
                              </View>

                              {/* Inline check-in button */}
                              {!place.user_checked_in ? (
                                <TouchableOpacity
                                  style={styles.checkInInlineBtn}
                                  onPress={() =>
                                    setCheckInSheet({
                                      visible: true,
                                      placeCode: place.place_code,
                                      placeName: place.name,
                                    })
                                  }
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.checkInInlineBtnText}>
                                    {t('groups.checkIn')}
                                  </Text>
                                </TouchableOpacity>
                              ) : null}

                              <MaterialIcons
                                name={isExpanded ? 'expand-less' : 'expand-more'}
                                size={20}
                                color={
                                  isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted
                                }
                              />
                            </TouchableOpacity>

                            {isExpanded && (
                              <View style={styles.placeExpanded}>
                                <View style={styles.divider} />

                                {/* Action buttons */}
                                <View style={styles.actionRow}>
                                  <TouchableOpacity
                                    style={styles.detailsBtn}
                                    onPress={() =>
                                      navigation.navigate('PlaceDetail', {
                                        placeCode: place.place_code,
                                      })
                                    }
                                    activeOpacity={0.8}
                                  >
                                    <Text style={styles.detailsBtnText}>{t('home.details')}</Text>
                                  </TouchableOpacity>
                                  {!place.user_checked_in && (
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
                                      <Text style={styles.checkInBtnText}>
                                        {t('groups.checkIn')}
                                      </Text>
                                    </TouchableOpacity>
                                  )}
                                </View>
                                {place.user_checked_in && (
                                  <View style={styles.alreadyCheckedBtn}>
                                    <Text style={styles.alreadyCheckedText}>
                                      ✓ {t('groups.checkedIn')}
                                    </Text>
                                  </View>
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
                                        setNoteInputs((prev) => ({
                                          ...prev,
                                          [place.place_code]: v,
                                        }))
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
                                        <MaterialIcons name="send" size={16} color="#fff" />
                                      )}
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
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

          {/* ACTIVITY TAB */}
          {activeTab === 'activity' && (
            <>
              {activity.length === 0 ? (
                <Text style={[styles.muted, { marginTop: 24 }]}>
                  {t('groups.noRecentActivity')}
                </Text>
              ) : (
                <View style={[styles.activityList, { marginTop: 8 }]}>
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

          {/* MEMBERS TAB */}
          {activeTab === 'members' && (
            <View style={{ marginTop: 8 }}>
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

              {inviteUrl ? (
                <View style={styles.inviteSection}>
                  <Text style={styles.inviteLabel}>{t('groups.shareInviteLink')}</Text>
                  <View style={styles.inviteRow}>
                    <Text style={styles.inviteUrl} numberOfLines={1}>
                      {inviteUrl}
                    </Text>
                    <TouchableOpacity
                      style={styles.inviteShareBtn}
                      onPress={() => shareUrl(group.name, inviteUrl)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="share" size={16} color="#fff" />
                      <Text style={styles.inviteShareText}>{t('common.share')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {/* Leaderboard in members tab */}
              {topThree.length > 0 ? (
                <View
                  style={{
                    marginTop: 24,
                    paddingTop: 16,
                    borderTopWidth: 1,
                    borderTopColor: isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder,
                  }}
                >
                  <Text style={styles.sectionTitle}>{t('groups.leaderboard')}</Text>
                  <View style={[styles.podium, { marginTop: 8 }]}>
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
                  {leaderboard.length > 3 ? (
                    <TouchableOpacity
                      onPress={() => setShowFullLeaderboard((v) => !v)}
                      style={styles.viewFull}
                    >
                      <Text style={styles.viewFullText}>
                        {showFullLeaderboard
                          ? t('groups.showLess')
                          : t('groups.viewFullLeaderboard')}
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
                </View>
              ) : null}
            </View>
          )}

          {/* Ad: bottom of tab content */}
          <View style={{ marginTop: 16 }}>
            <AdBannerNative slot="group-detail-bottom" format="banner" />
          </View>
        </View>
      </ScrollView>

      {/* ── GLASS CONTEXTUAL BOTTOM BAR ── */}
      <View style={[styles.glassBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.glassBarInner}>
          {isAdmin ? (
            <>
              <TouchableOpacity
                style={styles.glassBarBtn}
                onPress={() => navigation.navigate('EditGroup', { groupCode })}
                activeOpacity={0.8}
              >
                <MaterialIcons name="add-location" size={16} color="#fff" />
                <Text style={styles.glassBarBtnText}>{t('groups.addPlace')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.glassBarBtnOutline}
                onPress={() => shareUrl(group.name, inviteUrl || '')}
                activeOpacity={0.8}
              >
                <MaterialIcons name="share" size={16} color={tokens.colors.primary} />
                <Text style={styles.glassBarBtnTextOutline}>{t('common.share')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.glassBarBtn}
              onPress={() => shareUrl(group.name, inviteUrl || '')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="person-add" size={16} color="#fff" />
              <Text style={styles.glassBarBtnText}>{t('journey.inviteFriends')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

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
