import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  getPlace,
  getPlaceReviews,
  addFavorite,
  removeFavorite,
  checkIn as doCheckIn,
  getGroups,
} from '@/lib/api/client';
import { shareUrl } from '@/lib/share';
import { useAuth, useFeedback, useI18n, useTheme } from '@/app/providers';
import PlaceDetailSkeleton from '@/components/common/skeletons/PlaceDetailSkeleton';
import { useAuthRequired } from '@/lib/hooks/useAuthRequired';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { useAds } from '@/components/ads/AdProvider';
import { useUmamiTracking } from '@/lib/hooks/useUmamiTracking';
import { formatDistance } from '@/lib/utils/place-utils';
import type { RootStackParamList } from '@/app/navigation';
import type {
  PlaceDetail as PlaceDetailType,
  Review,
  PlaceTiming,
  PlaceSpecification,
} from '@/lib/types';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import { tokens } from '@/lib/theme';
import PlaceScorecardRow from '@/components/places/PlaceScorecardRow';
import PlaceTimingsCarousel from '@/components/places/PlaceTimingsCarousel';
import PlaceSpecificationsGrid from '@/components/places/PlaceSpecificationsGrid';
import PlaceReviewsList from '@/components/places/PlaceReviewsList';
import PlaceFAQ from '@/components/places/PlaceFAQ';
import NearbyPlaces from '@/components/places/NearbyPlaces';
import AddToGroupSheet from '@/components/groups/AddToGroupSheet';
import AdBannerNative from '@/components/ads/AdBannerNative';
import type { Group } from '@/lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>;
type PlaceDetailRoute = RouteProp<RootStackParamList, 'PlaceDetail'>;

const HERO_HEIGHT = 300;
const CARD_OVERLAP = 0;

function formatHoursDisplay(hours: string | undefined, t: (key: string) => string): string {
  if (!hours) return t('places.hoursNotAvailable');
  if (hours.toLowerCase() === 'closed') return t('places.closed');
  if (hours === 'OPEN_24_HOURS' || hours === '00:00-23:59') return t('places.open24Hours');
  if (hours.toLowerCase() === 'hours not available') return t('places.hoursNotAvailable');
  return hours;
}

export default function PlaceDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<PlaceDetailRoute>();
  const { placeCode } = route.params;
  const { user } = useAuth();
  const { t } = useI18n();
  const { isDark, units } = useTheme();
  const { showSuccess, showError } = useFeedback();
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const { requireAuth } = useAuthRequired();
  const { trackEvent } = useAnalytics();
  const { consent } = useAds();
  const { trackUmamiEvent } = useUmamiTracking('PlaceDetail', consent.analytics);

  const [place, setPlace] = useState<PlaceDetailType | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState<number | undefined>();
  const [reviewCount, setReviewCount] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInDone, setCheckInDone] = useState(false);
  const [checkInDate, setCheckInDate] = useState('');
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [storyOverflows, setStoryOverflows] = useState(false);
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);
  const [groups, setGroups] = useState<Group[]>([]);
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const heroScrollRef = useRef<ScrollView>(null);
  const [heroWidth, setHeroWidth] = useState(0);

  const scrollY = useRef(new Animated.Value(0)).current;
  const checkInScale = useRef(new Animated.Value(1)).current;

  const heroTranslateY = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT],
    outputRange: [0, -HERO_HEIGHT * 0.3],
    extrapolate: 'clamp',
  });
  const headerOpacity = scrollY.interpolate({
    inputRange: [HERO_HEIGHT - 80, HERO_HEIGHT - 20],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const fetchPlace = useCallback(async () => {
    if (!placeCode) return;
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      // Best-effort location fetch for distance computation
      let coords: { lat: number; lng: number } | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch {
        // silently ignore — distance will show '—' instead
      }
      const [placeData, reviewsData] = await Promise.all([
        getPlace(placeCode, coords),
        getPlaceReviews(placeCode, 10),
      ]);
      setPlace(placeData);
      setCheckInDone(placeData.user_has_checked_in === true);
      setReviews(reviewsData.reviews ?? []);
      setAverageRating(reviewsData.average_rating);
      setReviewCount(reviewsData.review_count);
      trackEvent('place_view', { place_code: placeData.place_code, religion: placeData.religion });
      trackUmamiEvent('place_view', { religion: placeData.religion });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error');
      setError(msg);
      setPlace(null);
      setReviews([]);
      if (msg.toLowerCase().includes('not found') || msg === 'Place not found') setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [placeCode, t, trackUmamiEvent]);

  useEffect(() => {
    fetchPlace();
  }, [fetchPlace]);

  // Update navigation header title when place data loads
  useEffect(() => {
    if (place?.name) {
      navigation.setOptions({ title: place.name });
    }
  }, [place?.name, navigation]);

  const fetchGroups = useCallback(() => {
    if (!user || !placeCode) return;
    getGroups()
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [user, placeCode]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Hero carousel auto-swipe
  useEffect(() => {
    const len = place?.images?.length ?? 0;
    if (len <= 1 || heroWidth === 0) return;
    const id = setInterval(() => {
      setHeroIdx((prev) => {
        const next = (prev + 1) % len;
        heroScrollRef.current?.scrollTo({ x: next * heroWidth, animated: true });
        return next;
      });
    }, 3000);
    return () => clearInterval(id);
  }, [place?.images?.length, heroWidth]);

  const doActualToggleFavorite = useCallback(async () => {
    if (!placeCode || !place) return;
    setFavoriteLoading(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const wasFavorite = place.is_favorite;
    try {
      if (wasFavorite) await removeFavorite(placeCode);
      else await addFavorite(placeCode);
      setPlace((p) => (p ? { ...p, is_favorite: !p.is_favorite } : null));
      trackEvent('favorite_toggle', {
        place_code: placeCode,
        action: wasFavorite ? 'remove' : 'add',
      });
      trackUmamiEvent(wasFavorite ? 'favorite_remove' : 'favorite_add');
      showSuccess(t(wasFavorite ? 'feedback.favoriteRemoved' : 'feedback.favoriteAdded'));
    } catch {
      showError(t('feedback.error'));
    } finally {
      setFavoriteLoading(false);
    }
  }, [placeCode, place, showSuccess, showError, t, trackUmamiEvent]);

  const toggleFavorite = useCallback(() => {
    requireAuth(() => doActualToggleFavorite());
  }, [requireAuth, doActualToggleFavorite]);

  const doActualCheckIn = useCallback(async () => {
    if (!placeCode || checkInLoading || checkInDone) return;
    setCheckInLoading(true);
    try {
      const result = await doCheckIn(placeCode);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.timing(checkInScale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
        Animated.timing(checkInScale, { toValue: 1.06, duration: 200, useNativeDriver: true }),
        Animated.timing(checkInScale, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
      const date = new Date(result.checked_in_at).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      setCheckInDate(date);
      trackEvent('check_in', { place_code: placeCode });
      trackUmamiEvent('check_in');
      setTimeout(() => setCheckInDone(true), 430);
      showSuccess(t('feedback.checkedIn'));
    } catch {
      showError(t('feedback.error'));
    } finally {
      setCheckInLoading(false);
    }
  }, [
    placeCode,
    checkInLoading,
    checkInDone,
    checkInScale,
    t,
    showSuccess,
    showError,
    trackUmamiEvent,
  ]);

  const handleCheckIn = useCallback(() => {
    requireAuth(() => doActualCheckIn(), 'visitor.loginRequired');
  }, [requireAuth, doActualCheckIn]);

  const renderCheckInBtn = () => {
    if (checkInDone) {
      return (
        <View style={styles.checkedInBadge}>
          <MaterialIcons name="check-circle" size={16} color="#059669" />
          <Text style={styles.checkedInText} numberOfLines={1}>
            {checkInDate
              ? t('places.checkedInDate').replace('{date}', checkInDate)
              : t('places.checkedIn')}
          </Text>
        </View>
      );
    }
    return (
      <Animated.View style={[styles.footerBtnPrimary, { transform: [{ scale: checkInScale }] }]}>
        <TouchableOpacity
          style={{
            flex: 1,
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
          }}
          onPress={handleCheckIn}
          disabled={checkInLoading}
          activeOpacity={0.8}
        >
          {checkInLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="location-on" size={16} color="#fff" />
              <Text style={styles.footerBtnPrimaryText}>{t('places.checkIn')}</Text>
            </>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (!placeCode) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>{t('places.missingCode')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Main')}>
          <Text style={styles.link}>{t('common.home')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && !place) {
    return <PlaceDetailSkeleton isDark={isDark} />;
  }

  if (notFound || (error && !place)) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.errorContainer, { paddingTop: insets.top + 24 }]}
      >
        <Text style={styles.errorTitle}>{t('places.notFound')}</Text>
        <Text style={styles.muted}>{error}</Text>
        <TouchableOpacity onPress={fetchPlace} style={styles.retryButton}>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Main')} style={styles.backButton}>
          <Text style={styles.backButtonText}>{t('common.home')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (!place) return null;

  const heroImages = (place.images ?? [])
    .map((img) => getFullImageUrl(img.url))
    .filter(Boolean) as string[];
  const heroImage = heroImages[0] ?? null;

  const timings: PlaceTiming[] = place.timings ?? [];
  const specifications: PlaceSpecification[] = place.specifications ?? [];
  const crowdLevel = (place as PlaceDetailType & { crowd_level?: string }).crowd_level;
  const totalCheckins = (place as PlaceDetailType & { total_checkins_count?: number })
    .total_checkins_count;

  const carouselTitle =
    place.religion === 'islam'
      ? t('placeDetail.prayerTimes')
      : place.religion === 'hinduism'
        ? t('placeDetail.divinePresence')
        : t('placeDetail.serviceTimes');

  const cardBg = isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textMain;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return (
    <View style={[styles.container, { backgroundColor: cardBg }]}>
      {/* Hero (fixed behind content) */}
      <Animated.View
        style={[styles.heroFixed, { transform: [{ translateY: heroTranslateY }] }]}
        onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}
      >
        {heroImages.length > 1 ? (
          heroWidth > 0 ? (
            <ScrollView
              ref={heroScrollRef}
              horizontal
              pagingEnabled
              scrollEnabled
              showsHorizontalScrollIndicator={false}
              style={StyleSheet.absoluteFill}
              onMomentumScrollEnd={(e) => {
                if (heroWidth > 0) {
                  setHeroIdx(Math.round(e.nativeEvent.contentOffset.x / heroWidth));
                }
              }}
            >
              {heroImages.map((src, i) => (
                <ExpoImage
                  key={i}
                  source={{ uri: src }}
                  style={{ width: heroWidth, height: HERO_HEIGHT }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              ))}
            </ScrollView>
          ) : (
            <ExpoImage
              source={{ uri: heroImages[0] }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          )
        ) : heroImage ? (
          <ExpoImage
            source={{ uri: heroImage }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.heroPlaceholder]}>
            <MaterialIcons name="location-city" size={64} color="rgba(255,255,255,0.5)" />
          </View>
        )}
        {/* gradient overlay */}
        <View style={styles.heroGradientTop} pointerEvents="none" />
        <View style={styles.heroGradientBottom} pointerEvents="none" />

        {/* Hero bottom info */}
        <View style={styles.heroBottom}>
          <View style={styles.heroBadgeRow}>
            {(() => {
              const status =
                place.open_status ??
                (place.is_open_now === true
                  ? 'open'
                  : place.is_open_now === false
                    ? 'closed'
                    : null);
              if (status === 'open')
                return (
                  <View style={[styles.heroBadge, styles.heroBadgeOpen]}>
                    <View style={[styles.heroBadgeDot, { backgroundColor: '#4ade80' }]} />
                    <Text style={styles.heroBadgeText}>{t('places.open')}</Text>
                  </View>
                );
              if (status === 'closed')
                return (
                  <View style={[styles.heroBadge, styles.heroBadgeClosed]}>
                    <View style={[styles.heroBadgeDot, { backgroundColor: '#f87171' }]} />
                    <Text style={styles.heroBadgeText}>{t('places.closed')}</Text>
                  </View>
                );
              if (status === 'unknown')
                return (
                  <View style={[styles.heroBadge, styles.heroBadgeUnknown]}>
                    <Text style={styles.heroBadgeText}>{t('places.unknown')}</Text>
                  </View>
                );
              return null;
            })()}
            {averageRating != null && (
              <View style={[styles.heroBadge, styles.heroBadgeRating]}>
                <MaterialIcons name="star" size={12} color="#fbbf24" />
                <Text style={styles.heroBadgeText}>{averageRating.toFixed(1)}</Text>
              </View>
            )}
          </View>
          <Text style={styles.heroName}>{place.name}</Text>
          {place.address ? <Text style={styles.heroAddress}>{place.address}</Text> : null}
        </View>
      </Animated.View>

      {/* Sticky Header (fades in as user scrolls past hero) */}
      <Animated.View
        style={[styles.stickyHeader, { opacity: headerOpacity, paddingTop: insets.top }]}
        pointerEvents="none"
      >
        <Text style={styles.stickyHeaderTitle} numberOfLines={1}>
          {place.name}
        </Text>
      </Animated.View>

      {/* Top bar buttons (always visible) */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <MaterialIcons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={() => {
              const apiBase = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3000';
              shareUrl(
                `${place.name}${averageRating != null ? ` • ${averageRating.toFixed(1)}★` : ''}`,
                `${apiBase}/share/places/${placeCode}`,
              );
            }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="share" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={toggleFavorite}
            disabled={favoriteLoading}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name={place.is_favorite ? 'favorite' : 'favorite-border'}
              size={20}
              color={place.is_favorite ? '#f87171' : '#fff'}
            />
          </TouchableOpacity>
        </View>
      </View>

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        {/* Spacer to push card below hero */}
        <View style={styles.heroSpacer} />

        {/* Card */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          {/* Scorecards */}
          <PlaceScorecardRow
            place={place}
            crowdLevel={crowdLevel}
            totalCheckins={totalCheckins}
            t={t}
            isDark={isDark}
          />

          {/* The Story */}
          {place.description ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: textMuted }]}>
                {t('placeDetail.theStory')}
              </Text>
              <View>
                {/* Invisible measurer to detect if text exceeds 5 lines */}
                <View style={{ position: 'absolute', left: 0, right: 0 }} pointerEvents="none">
                  <Text
                    style={[styles.description, { opacity: 0 }]}
                    onTextLayout={(e) => setStoryOverflows(e.nativeEvent.lines.length > 5)}
                  >
                    {place.description}
                  </Text>
                </View>
                <Text
                  style={[styles.description, { color: textSecondary }]}
                  numberOfLines={storyExpanded ? undefined : 5}
                >
                  {place.description}
                </Text>
              </View>
              {(storyOverflows || storyExpanded) && (
                <TouchableOpacity onPress={() => setStoryExpanded((v) => !v)} activeOpacity={0.7}>
                  <Text style={styles.readMore}>
                    {storyExpanded ? t('common.readLess') : t('common.readMore')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* Opening Hours */}
          {place.opening_hours && Object.keys(place.opening_hours).length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: textMuted }]}>
                {t('places.openingHours')}
              </Text>
              <View style={[styles.hoursCard, { backgroundColor: surface, borderColor: border }]}>
                {!hoursExpanded ? (
                  // Collapsed state: Show today's hours
                  <TouchableOpacity
                    onPress={() => setHoursExpanded(true)}
                    activeOpacity={0.7}
                    style={styles.hoursCollapsed}
                  >
                    <View style={styles.hoursCollapsedLeft}>
                      <MaterialIcons name="schedule" size={18} color={tokens.colors.primary} />
                      <Text style={[styles.hoursToday, { color: textMain }]}>
                        {t('places.today')}:
                      </Text>
                      <Text
                        style={[styles.hoursTodayValue, { color: textSecondary }]}
                        numberOfLines={1}
                      >
                        {formatHoursDisplay(place.opening_hours_today, t)}
                      </Text>
                    </View>
                    <MaterialIcons name="expand-more" size={20} color={tokens.colors.textMuted} />
                  </TouchableOpacity>
                ) : (
                  // Expanded state: Show full weekly schedule
                  <View style={styles.hoursExpanded}>
                    {(
                      [
                        'monday',
                        'tuesday',
                        'wednesday',
                        'thursday',
                        'friday',
                        'saturday',
                        'sunday',
                      ] as const
                    ).map((key, i) => {
                      const dayEn = [
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday',
                      ][i];
                      const hours = place.opening_hours?.[dayEn];
                      const isToday =
                        place.opening_hours_today &&
                        place.opening_hours?.[dayEn] === place.opening_hours_today;

                      return (
                        <View key={key} style={styles.hoursRow}>
                          <Text
                            style={[
                              styles.hoursDay,
                              { color: textSecondary },
                              isToday && styles.hoursDayToday,
                            ]}
                          >
                            {t(`common.${key}`)}
                          </Text>
                          <Text
                            style={[
                              styles.hoursValue,
                              { color: textSecondary },
                              isToday && styles.hoursValueToday,
                              { flexShrink: 1 },
                            ]}
                            numberOfLines={1}
                          >
                            {formatHoursDisplay(hours, t)}
                          </Text>
                        </View>
                      );
                    })}
                    <TouchableOpacity
                      onPress={() => setHoursExpanded(false)}
                      activeOpacity={0.7}
                      style={styles.hoursCollapseBtn}
                    >
                      <Text style={styles.hoursCollapseBtnText}>{t('common.showLess')}</Text>
                      <MaterialIcons name="expand-less" size={20} color={tokens.colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ) : null}

          {/* Religion-specific carousel */}
          {timings.length > 0 ? (
            <PlaceTimingsCarousel timings={timings} title={carouselTitle} isDark={isDark} />
          ) : null}

          {/* Ad: after timings carousel */}
          <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <AdBannerNative slot="place-detail-top" format="banner" />
          </View>

          {/* Facilities / Specifications */}
          {specifications.length > 0 ? (
            <PlaceSpecificationsGrid specifications={specifications} t={t} isDark={isDark} />
          ) : null}

          {/* Ad: between specifications and groups */}
          <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <AdBannerNative slot="place-detail-mid" format="medium-rectangle" />
          </View>

          {/* Groups */}
          {user && (
            <View style={styles.groupsSection}>
              <View style={styles.groupsSectionHeader}>
                <Text style={styles.groupsSectionTitle}>{t('groups.groupsWithPlace')}</Text>
                <TouchableOpacity onPress={() => setAddToGroupOpen(true)}>
                  <Text style={styles.groupsAddMore}>{t('groups.addToMoreGroups')}</Text>
                </TouchableOpacity>
              </View>
              {(() => {
                const matchingGroups = groups.filter((g) =>
                  g.path_place_codes?.includes(placeCode),
                );
                if (matchingGroups.length === 0) {
                  return (
                    <View style={styles.groupsEmpty}>
                      <MaterialIcons
                        name="group"
                        size={32}
                        color={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
                      />
                      <Text style={styles.groupsEmptyText}>
                        {groups.length === 0
                          ? t('groups.noGroupsYetShort')
                          : t('placeDetail.noGroupsYet')}
                      </Text>
                      <TouchableOpacity onPress={() => setAddToGroupOpen(true)}>
                        <Text style={styles.groupsAddMoreLink}>{t('groups.addPlace')}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }
                return (
                  <View style={styles.groupsList}>
                    {matchingGroups.map((g) => (
                      <TouchableOpacity
                        key={g.group_code}
                        style={styles.groupCard}
                        onPress={() =>
                          navigation.navigate('GroupDetail', { groupCode: g.group_code })
                        }
                        activeOpacity={0.7}
                      >
                        <View style={styles.groupCardAvatar}>
                          <MaterialIcons name="group" size={20} color={tokens.colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.groupCardName} numberOfLines={1}>
                            {g.name}
                          </Text>
                          <Text style={styles.groupCardMeta}>{g.member_count ?? 0} members</Text>
                        </View>
                        <MaterialIcons
                          name="chevron-right"
                          size={18}
                          color={isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}
            </View>
          )}

          {/* Ad: after reviews */}
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <AdBannerNative slot="place-detail-bottom" format="banner" />
          </View>

          {/* FAQ */}
          <PlaceFAQ faqs={place?.seo_faq_json} />

          {/* Nearby & Similar */}
          {place?.nearby_places && place.nearby_places.length > 0 && (
            <NearbyPlaces title={t('placeDetail.nearbyTitle')} places={place.nearby_places} />
          )}
          {place?.similar_places && place.similar_places.length > 0 && (
            <NearbyPlaces title={t('placeDetail.similarTitle')} places={place.similar_places} />
          )}

          {/* Reviews */}
          <PlaceReviewsList
            placeCode={placeCode}
            reviews={reviews}
            userCode={user?.user_code}
            averageRating={averageRating}
            reviewCount={reviewCount}
            onRefresh={fetchPlace}
            isDark={isDark}
          />
        </View>
      </Animated.ScrollView>

      {/* Sticky Footer — check-in only */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 12,
            paddingTop: 12,
            paddingHorizontal: 16,
            backgroundColor: surface,
            borderTopColor: border,
          },
        ]}
      >
        {renderCheckInBtn()}
      </View>

      {addToGroupOpen && place && (
        <AddToGroupSheet
          placeCode={placeCode}
          placeName={place.name}
          onClose={() => {
            setAddToGroupOpen(false);
            fetchGroups();
          }}
        />
      )}
    </View>
  );
}

function makeStyles(isDark: boolean) {
  const cardBg = isDark ? tokens.colors.darkBg : tokens.colors.backgroundLight;
  const surface = isDark ? tokens.colors.darkSurface : tokens.colors.surface;
  const border = isDark ? tokens.colors.darkBorder : tokens.colors.inputBorder;
  const textMain = isDark ? '#ffffff' : tokens.colors.textMain;
  const textSecondary = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textSecondary;
  const textMuted = isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: cardBg },
    scroll: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
    errorContainer: { paddingHorizontal: 24, alignItems: 'center' },
    errorTitle: { fontSize: 18, fontWeight: '600', color: textMain, marginBottom: 8 },
    muted: { fontSize: 14, color: textMuted },
    link: { color: tokens.colors.primary, fontWeight: '600', marginTop: 8 },
    retryButton: { marginTop: 12 },
    retryText: { color: tokens.colors.primary, fontWeight: '600' },
    backButton: { marginTop: 8 },
    backButtonText: { color: textSecondary, fontWeight: '600' },

    /* Sticky header */
    stickyHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      backgroundColor: tokens.colors.primary,
      paddingBottom: 12,
      paddingHorizontal: 72,
      alignItems: 'center',
    },
    stickyHeaderTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
      textAlign: 'center',
    },

    /* Top bar */
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 30,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    topBarRight: { flexDirection: 'row', gap: 10 },
    circleBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },

    /* Hero (fixed behind scroll content) */
    heroFixed: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: HERO_HEIGHT,
      backgroundColor: '#1a2e2e',
      zIndex: 0,
    },
    heroSpacer: {
      height: HERO_HEIGHT - CARD_OVERLAP,
    },
    heroPlaceholder: {
      backgroundColor: '#1a2e2e',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroGradientTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 100,
      backgroundColor: 'transparent',
    },
    heroGradientBottom: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    heroBottom: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 20,
      paddingBottom: 28,
    },
    heroBadgeRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    heroBadgeOpen: {
      backgroundColor: 'rgba(22, 163, 74, 0.3)',
      borderColor: 'rgba(74, 222, 128, 0.4)',
    },
    heroBadgeClosed: {
      backgroundColor: 'rgba(185, 28, 28, 0.3)',
      borderColor: 'rgba(248, 113, 113, 0.4)',
    },
    heroBadgeUnknown: {
      backgroundColor: 'rgba(148, 163, 184, 0.3)',
      borderColor: 'rgba(148, 163, 184, 0.4)',
    },
    heroBadgeRating: {},
    heroBadgeDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    heroBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#fff',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    heroName: {
      fontSize: 26,
      fontWeight: '700',
      color: '#fff',
      marginBottom: 4,
      letterSpacing: -0.3,
    },
    heroAddress: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.85)',
      fontWeight: '400',
    },

    /* Card */
    card: {
      marginTop: -CARD_OVERLAP,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: cardBg,
      paddingTop: 8,
      minHeight: 600,
    },

    /* Scorecards */
    scorecardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 20,
      marginTop: 20,
      marginBottom: 4,
      backgroundColor: surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: border,
      paddingVertical: 16,
      ...tokens.shadow.subtle,
    },
    scorecard: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    scorecardDivider: {
      width: 1,
      height: 40,
      backgroundColor: border,
    },
    scorecardValue: {
      fontSize: 15,
      fontWeight: '700',
      color: textMain,
      textAlign: 'center',
    },
    scorecardLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      textAlign: 'center',
    },

    /* Sections */
    section: {
      marginHorizontal: 20,
      marginTop: 24,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 16,
    },
    description: {
      fontSize: 15,
      color: textSecondary,
      lineHeight: 24,
    },
    readMore: {
      marginTop: 8,
      fontSize: 13,
      fontWeight: '600',
      color: tokens.colors.primary,
    },

    /* Opening Hours */
    hoursCard: {
      backgroundColor: surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: border,
      padding: 16,
    },
    hoursCollapsed: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    hoursCollapsedLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    hoursToday: {
      fontSize: 14,
      fontWeight: '600',
      color: textMain,
    },
    hoursTodayValue: {
      fontSize: 14,
      color: textSecondary,
    },
    hoursExpanded: {
      gap: 12,
    },
    hoursRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    hoursDay: {
      fontSize: 14,
      color: textSecondary,
    },
    hoursDayToday: {
      fontWeight: '600',
      color: tokens.colors.primary,
    },
    hoursValue: {
      fontSize: 14,
      color: textSecondary,
    },
    hoursValueToday: {
      fontWeight: '600',
      color: tokens.colors.primary,
    },
    hoursCollapseBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingTop: 8,
    },
    hoursCollapseBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: tokens.colors.primary,
    },

    /* Carousel */
    carouselContent: {
      flexDirection: 'row',
      gap: 16,
      paddingVertical: 8,
      paddingRight: 8,
    },

    /* Specs grid */
    specsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    specCard: {
      width: '47%',
      padding: 16,
      borderRadius: 16,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: border,
      ...tokens.shadow.subtle,
    },
    specLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginBottom: 4,
    },
    specValue: {
      fontSize: 14,
      fontWeight: '600',
      color: textMain,
    },

    /* Reviews */
    reviewHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    reviewMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    reviewMetaText: {
      fontSize: 14,
      fontWeight: '700',
      color: textMain,
    },
    reviewMetaMuted: {
      fontSize: 12,
      color: textMuted,
    },
    writeReviewLink: { marginBottom: 12 },
    writeReviewLinkText: {
      color: tokens.colors.primary,
      fontWeight: '600',
      fontSize: 14,
    },
    reviewList: { gap: 12 },
    reviewCard: {
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    reviewCardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    reviewAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: `${tokens.colors.primary}22`,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    reviewAvatarText: {
      fontSize: 14,
      fontWeight: '700',
      color: tokens.colors.primary,
    },
    reviewCardMeta: { flex: 1, minWidth: 0 },
    reviewAuthor: {
      fontWeight: '600',
      color: textMain,
      fontSize: 14,
    },
    reviewDate: { fontSize: 12, color: textMuted },
    reviewCardRight: { alignItems: 'flex-end' },
    starRow: { flexDirection: 'row', gap: 2 },
    star: { fontSize: 13, color: tokens.colors.goldRank },
    reviewActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    reviewActionBtn: { paddingVertical: 2 },
    reviewActionEdit: { fontSize: 13, color: tokens.colors.primary, fontWeight: '600' },
    reviewActionDelete: { fontSize: 13, color: '#dc2626', fontWeight: '600' },
    reviewTitle: {
      fontWeight: '600',
      color: textMain,
      marginBottom: 4,
      fontSize: 14,
    },
    reviewBody: { fontSize: 14, color: textSecondary, lineHeight: 20 },
    reviewPhotos: { marginTop: 12 },
    reviewPhotosContent: { gap: 8 },
    reviewPhoto: {
      width: 80,
      height: 80,
      borderRadius: 8,
    },

    /* Footer */
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: surface,
      borderTopWidth: 1,
      borderTopColor: border,
    },
    footerBtnPrimary: {
      flex: 2,
      paddingVertical: 15,
      borderRadius: 20,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      shadowColor: tokens.colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    },
    footerBtnPrimaryText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#fff',
      letterSpacing: 0.5,
    },
    checkedInBadge: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 13,
      borderRadius: 14,
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      borderWidth: 1.5,
      borderColor: 'rgba(16, 185, 129, 0.35)',
    },
    checkedInText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#059669',
    },
    // Groups section
    groupsSection: {
      marginTop: 24,
      paddingHorizontal: 20,
    },
    groupsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    groupsSectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#ffffff' : tokens.colors.textDark,
    },
    groupsAddMore: {
      fontSize: 13,
      fontWeight: '600',
      color: tokens.colors.primary,
    },
    groupsEmpty: {
      alignItems: 'center',
      paddingVertical: 24,
      backgroundColor: isDark ? tokens.colors.darkSurface : '#F8FAFC',
      borderRadius: 16,
      gap: 8,
    },
    groupsEmptyText: {
      fontSize: 13,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted,
      textAlign: 'center',
    },
    groupsAddMoreLink: {
      fontSize: 13,
      fontWeight: '600',
      color: tokens.colors.primary,
    },
    groupsList: { gap: 8 },
    groupCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? tokens.colors.darkBorder : 'rgba(0,0,0,0.06)',
      backgroundColor: isDark ? tokens.colors.darkSurface : '#ffffff',
    },
    groupCardAvatar: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupCardName: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#ffffff' : tokens.colors.textDark,
    },
    groupCardMeta: {
      fontSize: 12,
      color: isDark ? tokens.colors.darkTextSecondary : tokens.colors.textMuted,
      marginTop: 2,
    },
  }); // end StyleSheet.create
} // end makeStyles
