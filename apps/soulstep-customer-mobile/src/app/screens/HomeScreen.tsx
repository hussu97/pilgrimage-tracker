/**
 * Journey Dashboard — the home screen of SoulStep (mobile).
 *
 * Mirrors the web Journey Dashboard at apps/soulstep-customer-web/src/app/pages/Home.tsx.
 *
 * Shows:
 *   • Greeting header with notification + profile buttons
 *   • Active Journey hero card with circular progress ring (SVG via react-native-svg if available,
 *     otherwise a simple text percentage fallback)
 *   • Quick Actions 2×2 grid (individual colorful cards)
 *   • Popular Places carousel (top-rated + most checked-in nearby)
 *   • Popular Cities horizontal scroll
 *   • Recommended Places horizontal carousel
 *   • Popular Journeys horizontal carousel
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Image,
  Dimensions,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useAuth, useI18n, useTheme } from '@/app/providers';
import { getGroups } from '@/lib/api/client';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import AddToGroupSheet from '@/components/groups/AddToGroupSheet';
import JoinJourneyModal from '@/components/groups/JoinJourneyModal';
import type { Group, Place } from '@/lib/types';
import type { RootStackParamList } from '@/app/navigation';
import { tokens } from '@/lib/theme';

// ── API base ──────────────────────────────────────────────────────────────────

const API_BASE: string =
  Constants.expoConfig?.extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3000';

// ── Local types ───────────────────────────────────────────────────────────────

interface RecommendedPlace {
  place_code: string;
  name: string;
  religion: string;
  address: string;
  city?: string;
  image_url?: string | null;
  distance_km?: number | null;
}

interface PopularPlace {
  place_code: string;
  name: string;
  religion: string;
  address?: string;
  city?: string;
  images: { url: string }[];
  average_rating?: number | null;
  review_count?: number | null;
  total_checkins_count?: number | null;
  distance?: number | null;
}

interface PopularCity {
  city: string;
  city_slug: string;
  count: number;
}

interface FeaturedJourney {
  group_code: string;
  name: string;
  description?: string;
  cover_image_url?: string | null;
  total_sites: number;
  member_count: number;
}

// ── Quick action accent colors ────────────────────────────────────────────────

const ACTION_COLORS = {
  map: '#10B981',
  create: '#3B82F6',
  join: '#8B5CF6',
  favorites: '#F43F5E',
} as const;

// ── API thin wrappers ─────────────────────────────────────────────────────────

async function fetchFeaturedJourneys(): Promise<FeaturedJourney[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/groups/featured`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function fetchRecommendedPlaces(params: {
  lat?: number | null;
  lng?: number | null;
  religions?: string[];
}): Promise<RecommendedPlace[]> {
  try {
    const qs = new URLSearchParams();
    if (params.lat != null) qs.set('lat', String(params.lat));
    if (params.lng != null) qs.set('lng', String(params.lng));
    (params.religions ?? []).forEach((r) => qs.append('religions', r));
    const url = `${API_BASE}/api/v1/places/recommended?${qs.toString()}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function fetchPopularPlaces(): Promise<PopularPlace[]> {
  try {
    const qs = new URLSearchParams({
      sort: 'rating',
      include_rating: 'true',
      include_checkins: 'true',
      limit: '40',
    });
    const res = await fetch(`${API_BASE}/api/v1/places?${qs.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.places ?? data.items ?? []);
  } catch {
    return [];
  }
}

async function fetchPopularCities(): Promise<PopularCity[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/cities?limit=10`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.cities ?? [];
  } catch {
    return [];
  }
}

async function fetchPlaceCount(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/places/count`);
    if (!res.ok) return 0;
    const data = await res.json();
    return typeof data.total === 'number' ? data.total : 0;
  } catch {
    return 0;
  }
}

// ── makeStyles ────────────────────────────────────────────────────────────────

function makeStyles(isDark: boolean) {
  const bg = isDark ? tokens.colors.darkBg : '#F5F0E9';
  const surface = isDark ? tokens.colors.darkSurface : '#ffffff';
  const border = isDark ? tokens.colors.darkBorder : 'rgba(0,0,0,0.06)';
  const textMain = isDark ? '#ffffff' : tokens.colors.textDark;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: bg,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 32,
    },
    // ── Header ──
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
    },
    tickerCount: {
      fontSize: 36,
      fontWeight: '800',
      color: tokens.colors.primary,
      letterSpacing: -1,
      lineHeight: 40,
    },
    tickerSubtitle: {
      fontSize: 12,
      color: textMuted,
      marginTop: 2,
      fontWeight: '500',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...tokens.shadow.card,
    },
    avatarCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: tokens.colors.primaryAlpha,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 14,
      fontWeight: '700',
      color: tokens.colors.primary,
    },
    // ── Section wrapper ──
    section: {
      paddingHorizontal: 20,
      marginTop: 20,
    },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: textMain,
    },
    seeMore: {
      fontSize: 12,
      fontWeight: '600',
      color: tokens.colors.primary,
    },
    // ── Active Journey Hero Card ──
    heroCard: {
      marginHorizontal: 20,
      marginTop: 16,
      borderRadius: tokens.borderRadius['3xl'],
      overflow: 'hidden',
      height: 176,
      ...tokens.shadow.cardMd,
    },
    heroCoverImage: {
      ...StyleSheet.absoluteFillObject,
      width: '100%',
      height: '100%',
    },
    heroCoverOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    heroGradientFallback: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: tokens.colors.primary,
    },
    heroContent: {
      flex: 1,
      padding: 16,
      justifyContent: 'space-between',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    heroLabel: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 1,
      color: 'rgba(255,255,255,0.8)',
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    heroTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#ffffff',
      letterSpacing: -0.5,
    },
    // Progress ring area
    progressRingWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 56,
      height: 56,
    },
    progressRingTrack: {
      position: 'absolute',
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 4,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    progressRingFill: {
      position: 'absolute',
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 4,
      borderColor: '#ffffff',
    },
    progressPct: {
      fontSize: 12,
      fontWeight: '700',
      color: '#ffffff',
    },
    heroBottom: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    heroNextUp: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.8)',
      marginBottom: 2,
    },
    heroNextUpName: {
      fontWeight: '600',
      color: '#ffffff',
    },
    heroPlacesCount: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.7)',
    },
    heroContinueBtn: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: tokens.borderRadius.full,
    },
    heroContinueText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#ffffff',
    },
    // ── Empty Journey Card ──
    emptyCard: {
      marginHorizontal: 20,
      marginTop: 16,
      borderRadius: tokens.borderRadius['3xl'],
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: isDark ? tokens.colors.darkBorder : '#D1C7BD',
      paddingVertical: 32,
      paddingHorizontal: 20,
      alignItems: 'center',
    },
    emptyIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: tokens.colors.primaryAlpha,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: textMain,
      textAlign: 'center',
      marginBottom: 6,
    },
    emptyDesc: {
      fontSize: 13,
      color: textSecondary,
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: 260,
    },
    emptyBtn: {
      marginTop: 16,
      backgroundColor: tokens.colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: tokens.borderRadius.full,
    },
    emptyBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
    },
    // ── Skeleton / loading ──
    skeleton: {
      backgroundColor: isDark ? tokens.colors.darkSurface : '#E5DDD6',
      borderRadius: tokens.borderRadius['3xl'],
      height: 176,
      marginHorizontal: 20,
      marginTop: 16,
    },
    // ── Quick Actions 2×2 grid ──
    quickActionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    quickActionCard: {
      backgroundColor: surface,
      borderRadius: tokens.borderRadius['2xl'],
      padding: 16,
      alignItems: 'flex-start',
      borderWidth: 1,
      borderColor: border,
      ...tokens.shadow.card,
      // width set inline to ((screen - 40 - 12) / 2)
    },
    quickActionIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    quickActionCardLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: textMain,
      marginBottom: 2,
    },
    quickActionCardSub: {
      fontSize: 11,
      color: textMuted,
    },
    // ── Popular Places carousel ──
    carousel: {
      paddingLeft: 20,
      paddingRight: 8,
    },
    popularPlaceCard: {
      width: 180,
      borderRadius: tokens.borderRadius['2xl'],
      backgroundColor: surface,
      overflow: 'hidden',
      marginRight: 12,
      ...tokens.shadow.card,
      borderWidth: 1,
      borderColor: border,
    },
    popularPlaceImage: {
      width: '100%',
      height: 110,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#E5DDD6',
    },
    popularPlaceImageFallback: {
      width: '100%',
      height: 110,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#E5DDD6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    popularPlaceBody: {
      padding: 10,
    },
    popularPlaceName: {
      fontSize: 12,
      fontWeight: '600',
      color: textMain,
      marginBottom: 2,
    },
    popularPlaceReligion: {
      fontSize: 10,
      color: textMuted,
      textTransform: 'capitalize',
      marginBottom: 6,
    },
    popularPlaceMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    popularPlaceMetaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    popularPlaceMetaText: {
      fontSize: 10,
      color: textMuted,
    },
    ratingStarText: {
      fontSize: 10,
      color: '#F59E0B',
      fontWeight: '600',
    },
    placeDistanceBadge: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 99,
    },
    placeDistanceText: {
      fontSize: 10,
      color: '#ffffff',
      fontWeight: '600',
    },
    // ── Popular Cities ──
    cityChip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: tokens.borderRadius.full,
      backgroundColor: surface,
      marginRight: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: border,
      ...tokens.shadow.card,
      minWidth: 80,
    },
    cityChipName: {
      fontSize: 13,
      fontWeight: '600',
      color: textMain,
    },
    cityChipCount: {
      fontSize: 10,
      color: textMuted,
      marginTop: 1,
    },
    // ── Recommended Places carousel ──
    placeCardSmall: {
      width: 160,
      borderRadius: tokens.borderRadius['2xl'],
      backgroundColor: surface,
      overflow: 'hidden',
      marginRight: 12,
      ...tokens.shadow.card,
      borderWidth: 1,
      borderColor: border,
    },
    placeCardImage: {
      width: '100%',
      height: 100,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#E5DDD6',
    },
    placeCardImageFallback: {
      width: '100%',
      height: 100,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#E5DDD6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeCardBody: {
      padding: 10,
    },
    placeCardName: {
      fontSize: 12,
      fontWeight: '600',
      color: textMain,
      marginBottom: 2,
    },
    placeCardReligion: {
      fontSize: 10,
      color: textMuted,
      textTransform: 'capitalize',
    },
    addToJourneyBtn: {
      marginTop: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)',
    },
    addToJourneyText: {
      fontSize: 10,
      fontWeight: '600',
      color: tokens.colors.primary,
    },
    // ── Popular Journeys carousel ──
    journeyCardSmall: {
      width: 192,
      borderRadius: tokens.borderRadius['2xl'],
      backgroundColor: surface,
      overflow: 'hidden',
      marginRight: 12,
      ...tokens.shadow.card,
      borderWidth: 1,
      borderColor: border,
    },
    journeyCardImage: {
      width: '100%',
      height: 100,
      backgroundColor: tokens.colors.primaryAlpha,
    },
    journeyCardImageFallback: {
      width: '100%',
      height: 100,
      backgroundColor: tokens.colors.primaryAlpha,
      alignItems: 'center',
      justifyContent: 'center',
    },
    journeyCardBody: {
      padding: 10,
    },
    journeyCardName: {
      fontSize: 12,
      fontWeight: '600',
      color: textMain,
      marginBottom: 4,
    },
    journeyCardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    journeyCardMetaText: {
      fontSize: 10,
      color: textMuted,
    },
    journeyCardDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: isDark ? tokens.colors.darkBorder : '#D1C7BD',
    },
  });
}

// ── Circular Progress Ring (simple View-based since react-native-svg not in deps) ──

function ProgressRing({ pct }: { pct: number }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 56, height: 56 }}>
      <View
        style={{
          position: 'absolute',
          width: 56,
          height: 56,
          borderRadius: 28,
          borderWidth: 4,
          borderColor: 'rgba(255,255,255,0.25)',
        }}
      />
      {/* We can't do partial arcs without SVG. Show a filled arc approximation
          by using a partial border with a colored override. For now show the % text. */}
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#ffffff' }}>{pct}%</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { t } = useI18n();
  const { isDark } = useTheme();

  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const [journeys, setJourneys] = useState<Group[]>([]);
  const [journeysLoading, setJourneysLoading] = useState(false);
  const [recommended, setRecommended] = useState<RecommendedPlace[]>([]);
  const [featured, setFeatured] = useState<FeaturedJourney[]>([]);
  const [popularPlaces, setPopularPlaces] = useState<PopularPlace[]>([]);
  const [popularCities, setPopularCities] = useState<PopularCity[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addToJourneyPlace, setAddToJourneyPlace] = useState<RecommendedPlace | null>(null);
  const [placeCount, setPlaceCount] = useState(0);
  const [joinModalVisible, setJoinModalVisible] = useState(false);

  // Animated count ticker
  const countAnim = useRef(new Animated.Value(0)).current;
  const [displayCount, setDisplayCount] = useState(0);

  const screenWidth = Dimensions.get('window').width;
  const actionCardWidth = (screenWidth - 40 - 12) / 2;
  // 2.3-item carousel card width
  const cardWidth = Math.min((screenWidth - 40) / 2.3, 200);

  // ── Data fetching ──

  const loadJourneys = useCallback(async () => {
    if (!user) {
      setJourneys([]);
      return;
    }
    setJourneysLoading(true);
    try {
      const data = await getGroups();
      setJourneys(Array.isArray(data) ? data : []);
    } catch {
      // silently skip
    } finally {
      setJourneysLoading(false);
    }
  }, [user]);

  const loadRecommended = useCallback(async () => {
    try {
      const religions = (user?.religions ?? []).filter((r) => r !== 'all');
      const data = await fetchRecommendedPlaces({ religions });
      setRecommended(data.slice(0, 10));
    } catch {
      // silently skip
    }
  }, [user?.religions]);

  const loadFeatured = useCallback(async () => {
    try {
      const data = await fetchFeaturedJourneys();
      setFeatured(data.slice(0, 10));
    } catch {
      // silently skip
    }
  }, []);

  const loadPopularPlaces = useCallback(async () => {
    try {
      const data = await fetchPopularPlaces();
      setPopularPlaces(data);
    } catch {
      // silently skip
    }
  }, []);

  const loadPopularCities = useCallback(async () => {
    try {
      const data = await fetchPopularCities();
      setPopularCities(data.slice(0, 10));
    } catch {
      // silently skip
    }
  }, []);

  const loadPlaceCount = useCallback(async () => {
    try {
      const count = await fetchPlaceCount();
      setPlaceCount(count);
    } catch {
      // silently skip
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([
      loadJourneys(),
      loadRecommended(),
      loadFeatured(),
      loadPopularPlaces(),
      loadPopularCities(),
      loadPlaceCount(),
    ]);
  }, [
    loadJourneys,
    loadRecommended,
    loadFeatured,
    loadPopularPlaces,
    loadPopularCities,
    loadPlaceCount,
  ]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Animate count ticker when placeCount changes
  useEffect(() => {
    if (placeCount === 0) return;
    countAnim.setValue(0);
    const listener = countAnim.addListener(({ value }) => {
      setDisplayCount(Math.round(value));
    });
    Animated.timing(countAnim, {
      toValue: placeCount,
      duration: 1400,
      useNativeDriver: false,
    }).start();
    return () => {
      countAnim.removeListener(listener);
    };
  }, [placeCount, countAnim]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ── Derived state ──

  const activeJourneys = journeys.filter(
    (g) => (g.total_sites ?? 0) > 0 && (g.sites_visited ?? 0) < (g.total_sites ?? 0),
  );
  const primaryJourney: Group | null = activeJourneys[0] ?? journeys[0] ?? null;

  const pct =
    primaryJourney && (primaryJourney.total_sites ?? 0) > 0
      ? Math.round(((primaryJourney.sites_visited ?? 0) / (primaryJourney.total_sites ?? 1)) * 100)
      : 0;

  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  // ── Render helpers ──

  function renderHeader() {
    return (
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.tickerCount}>
            {placeCount > 0 ? displayCount.toLocaleString() : '—'}
          </Text>
          <Text style={styles.tickerSubtitle}>{t('dashboard.totalPlaces')}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconCircle}
            onPress={() => navigation.navigate('Notifications')}
            accessibilityLabel="Notifications"
          >
            <MaterialIcons
              name="notifications-none"
              size={20}
              color={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.avatarCircle}
            onPress={() => navigation.navigate('Main')}
            accessibilityLabel="Profile"
          >
            {user?.display_name?.[0] ? (
              <Text style={styles.avatarText}>{user.display_name[0].toUpperCase()}</Text>
            ) : (
              <MaterialIcons name="person" size={18} color={tokens.colors.primary} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderHeroCard() {
    if (journeysLoading) {
      return <View style={styles.skeleton} />;
    }

    if (!primaryJourney) {
      // Empty state
      return (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <MaterialIcons name="route" size={32} color={tokens.colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t('journey.createFirst')}</Text>
          <Text style={styles.emptyDesc}>{t('journey.createFirstDesc')}</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.navigate(user ? 'CreateGroup' : 'Login')}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyBtnText}>{t('journey.startPlanning')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const coverUri = primaryJourney.cover_image_url
      ? getFullImageUrl(primaryJourney.cover_image_url)
      : null;

    return (
      <TouchableOpacity
        style={styles.heroCard}
        activeOpacity={0.92}
        onPress={() => navigation.navigate('GroupDetail', { groupCode: primaryJourney.group_code })}
      >
        {coverUri ? (
          <>
            <Image source={{ uri: coverUri }} style={styles.heroCoverImage} resizeMode="cover" />
            <View style={styles.heroCoverOverlay} />
          </>
        ) : (
          <View style={styles.heroGradientFallback} />
        )}

        <View style={styles.heroContent}>
          {/* Top row: label + name | progress ring */}
          <View style={styles.heroTop}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.heroLabel}>{t('journey.activeJourney')}</Text>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {primaryJourney.name}
              </Text>
            </View>
            <ProgressRing pct={pct} />
          </View>

          {/* Bottom row: next up + continue btn */}
          <View style={styles.heroBottom}>
            <View style={{ flex: 1, marginRight: 12 }}>
              {primaryJourney.next_place_name ? (
                <Text style={styles.heroNextUp} numberOfLines={1}>
                  {t('journey.nextUp')}:{' '}
                  <Text style={styles.heroNextUpName}>{primaryJourney.next_place_name}</Text>
                </Text>
              ) : null}
              <Text style={styles.heroPlacesCount}>
                {primaryJourney.sites_visited ?? 0}/{primaryJourney.total_sites ?? 0}{' '}
                {t('journey.placesCount').replace('{count}', '').trim()}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.heroContinueBtn}
              onPress={() =>
                navigation.navigate('GroupDetail', { groupCode: primaryJourney.group_code })
              }
              activeOpacity={0.8}
            >
              <Text style={styles.heroContinueText}>{t('journey.continueJourney')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  function renderQuickActions() {
    const actions = [
      {
        key: 'map',
        icon: 'map' as const,
        color: ACTION_COLORS.map,
        label: t('journey.exploreMap'),
        sub: t('nav.places'),
        onPress: () => navigation.navigate('Places'),
      },
      {
        key: 'create',
        icon: 'add-circle-outline' as const,
        color: ACTION_COLORS.create,
        label: t('journey.newJourney'),
        sub: t('journey.startPlanning'),
        onPress: () => navigation.navigate(user ? 'CreateGroup' : 'Login'),
      },
      {
        key: 'join',
        icon: 'group-add' as const,
        color: ACTION_COLORS.join,
        label: t('journey.joinWithCode'),
        sub: t('journey.joinExisting'),
        onPress: () => setJoinModalVisible(true),
      },
      {
        key: 'favorites',
        icon: 'favorite-border' as const,
        color: ACTION_COLORS.favorites,
        label: t('favorites.title'),
        sub: t('favorites.savedPlaces'),
        onPress: () => navigation.navigate('Favorites'),
      },
    ];

    return (
      <View style={styles.section}>
        <View style={styles.quickActionsGrid}>
          {actions.map((a) => (
            <TouchableOpacity
              key={a.key}
              style={[styles.quickActionCard, { width: actionCardWidth }]}
              onPress={a.onPress}
              activeOpacity={0.8}
            >
              <View style={[styles.quickActionIconWrap, { backgroundColor: a.color + '1A' }]}>
                <MaterialIcons name={a.icon} size={22} color={a.color} />
              </View>
              <Text style={styles.quickActionCardLabel} numberOfLines={1}>
                {a.label}
              </Text>
              {a.sub ? (
                <Text style={styles.quickActionCardSub} numberOfLines={1}>
                  {a.sub}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  function renderPopularPlaces() {
    if (popularPlaces.length === 0) return null;

    return (
      <View style={{ marginTop: 24 }}>
        <View style={[styles.sectionRow, { paddingHorizontal: 20 }]}>
          <Text style={styles.sectionTitle}>{t('dashboard.popularPlaces')}</Text>
        </View>
        <FlatList
          data={popularPlaces}
          keyExtractor={(item) => item.place_code}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
          renderItem={({ item }) => {
            const imgUri = item.images?.[0]?.url ? getFullImageUrl(item.images[0].url) : null;
            return (
              <TouchableOpacity
                style={[styles.popularPlaceCard, { width: cardWidth }]}
                activeOpacity={0.88}
                onPress={() => navigation.navigate('PlaceDetail', { placeCode: item.place_code })}
              >
                {imgUri ? (
                  <View>
                    <Image
                      source={{ uri: imgUri }}
                      style={styles.popularPlaceImage}
                      resizeMode="cover"
                    />
                    {item.distance != null && (
                      <View style={styles.placeDistanceBadge}>
                        <Text style={styles.placeDistanceText}>
                          {item.distance < 1
                            ? `${Math.round(item.distance * 1000)}m`
                            : `${item.distance.toFixed(1)}km`}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.popularPlaceImageFallback}>
                    <MaterialIcons name="place" size={32} color={textMuted} />
                  </View>
                )}
                <View style={styles.popularPlaceBody}>
                  <Text style={styles.popularPlaceName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.popularPlaceReligion} numberOfLines={1}>
                    {item.religion}
                  </Text>
                  <View style={styles.popularPlaceMeta}>
                    {item.average_rating != null && item.average_rating > 0 && (
                      <View style={styles.popularPlaceMetaChip}>
                        <Text style={styles.ratingStarText}>★</Text>
                        <Text style={styles.popularPlaceMetaText}>
                          {item.average_rating.toFixed(1)}
                        </Text>
                      </View>
                    )}
                    {item.total_checkins_count != null && item.total_checkins_count > 0 && (
                      <View style={styles.popularPlaceMetaChip}>
                        <MaterialIcons name="check-circle-outline" size={11} color={textMuted} />
                        <Text style={styles.popularPlaceMetaText}>{item.total_checkins_count}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  }

  function renderPopularCities() {
    if (popularCities.length === 0) return null;

    return (
      <View style={{ marginTop: 24 }}>
        <View style={[styles.sectionRow, { paddingHorizontal: 20 }]}>
          <Text style={styles.sectionTitle}>{t('dashboard.popularCities')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('ExploreCities')}>
            <Text style={styles.seeMore}>{t('common.showMore')}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingLeft: 20, paddingRight: 8 }}
        >
          {popularCities.map((city) => (
            <TouchableOpacity
              key={city.city_slug}
              style={styles.cityChip}
              activeOpacity={0.8}
              onPress={() =>
                navigation.navigate('ExploreCity', {
                  citySlug: city.city_slug,
                  cityName: city.city,
                })
              }
            >
              <Text style={styles.cityChipName}>{city.city}</Text>
              <Text style={styles.cityChipCount}>
                {city.count} {t('nav.places').toLowerCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  function renderRecommendedPlaces() {
    if (recommended.length === 0) return null;

    return (
      <View style={{ marginTop: 24 }}>
        <View style={[styles.sectionRow, { paddingHorizontal: 20 }]}>
          <Text style={styles.sectionTitle}>{t('journey.recommendedPlaces')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Places')}>
            <Text style={styles.seeMore}>{t('common.showMore')}</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={recommended}
          keyExtractor={(item) => item.place_code}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
          renderItem={({ item }) => {
            const imgUri = item.image_url ? getFullImageUrl(item.image_url) : null;
            return (
              <TouchableOpacity
                style={[styles.placeCardSmall, { width: cardWidth }]}
                activeOpacity={0.88}
                onPress={() => navigation.navigate('PlaceDetail', { placeCode: item.place_code })}
              >
                {imgUri ? (
                  <View>
                    <Image
                      source={{ uri: imgUri }}
                      style={styles.placeCardImage}
                      resizeMode="cover"
                    />
                    {item.distance_km != null && (
                      <View style={styles.placeDistanceBadge}>
                        <Text style={styles.placeDistanceText}>
                          {item.distance_km < 1
                            ? `${Math.round(item.distance_km * 1000)}m`
                            : `${item.distance_km.toFixed(1)}km`}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.placeCardImageFallback}>
                    <MaterialIcons name="place" size={28} color={textMuted} />
                  </View>
                )}
                <View style={styles.placeCardBody}>
                  <Text style={styles.placeCardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.placeCardReligion} numberOfLines={1}>
                    {item.religion}
                  </Text>
                  <TouchableOpacity
                    style={styles.addToJourneyBtn}
                    activeOpacity={0.75}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setAddToJourneyPlace(item);
                    }}
                  >
                    <Text style={styles.addToJourneyText}>+ {t('map.addToJourney')}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  }

  function renderPopularJourneys() {
    if (featured.length === 0) return null;

    return (
      <View style={{ marginTop: 24 }}>
        <View style={[styles.sectionRow, { paddingHorizontal: 20 }]}>
          <Text style={styles.sectionTitle}>{t('journey.popularJourneys')}</Text>
        </View>
        <FlatList
          data={featured}
          keyExtractor={(item) => item.group_code}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
          renderItem={({ item }) => {
            const imgUri = item.cover_image_url ? getFullImageUrl(item.cover_image_url) : null;
            return (
              <TouchableOpacity
                style={[styles.journeyCardSmall, { width: cardWidth }]}
                activeOpacity={0.88}
                onPress={() => navigation.navigate('GroupDetail', { groupCode: item.group_code })}
              >
                {imgUri ? (
                  <Image
                    source={{ uri: imgUri }}
                    style={styles.journeyCardImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.journeyCardImageFallback}>
                    <MaterialIcons name="route" size={28} color={tokens.colors.primary} />
                  </View>
                )}
                <View style={styles.journeyCardBody}>
                  <Text style={styles.journeyCardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.journeyCardMeta}>
                    <Text style={styles.journeyCardMetaText}>
                      {item.total_sites} {t('journey.placesCount').replace('{count}', '').trim()}
                    </Text>
                    <View style={styles.journeyCardDot} />
                    <Text style={styles.journeyCardMetaText}>
                      {item.member_count}{' '}
                      {t('journey.membersCount')?.replace('{count}', '').trim() ?? 'members'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  }

  // ── Render ──

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[tokens.colors.primary]}
            tintColor={tokens.colors.primary}
          />
        }
      >
        {renderHeader()}
        {renderHeroCard()}
        {renderQuickActions()}
        {renderPopularPlaces()}
        {renderPopularCities()}
        {renderRecommendedPlaces()}
        {renderPopularJourneys()}
      </ScrollView>
      {addToJourneyPlace && (
        <AddToGroupSheet
          placeCode={addToJourneyPlace.place_code}
          placeName={addToJourneyPlace.name}
          onClose={() => setAddToJourneyPlace(null)}
        />
      )}
      <JoinJourneyModal visible={joinModalVisible} onClose={() => setJoinModalVisible(false)} />
    </View>
  );
}
