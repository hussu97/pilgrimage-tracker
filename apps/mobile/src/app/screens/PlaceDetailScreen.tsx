import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
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
} from '@/lib/api/client';
import { shareUrl, openDirections } from '@/lib/share';
import { useAuth, useI18n, useTheme } from '@/app/providers';
import { useAuthRequired } from '@/lib/hooks/useAuthRequired';
import type { RootStackParamList } from '@/app/navigation';
import type { PlaceDetail as PlaceDetailType, Review } from '@/lib/types';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import { tokens } from '@/lib/theme';
import PlaceScorecardRow from '@/components/places/PlaceScorecardRow';
import PlaceTimingsCarousel from '@/components/places/PlaceTimingsCarousel';
import PlaceSpecificationsGrid from '@/components/places/PlaceSpecificationsGrid';
import PlaceReviewsList from '@/components/places/PlaceReviewsList';

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
  const { isDark } = useTheme();
  const { requireAuth } = useAuthRequired();

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
  const [hoursExpanded, setHoursExpanded] = useState(false);

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
      const [placeData, reviewsData] = await Promise.all([
        getPlace(placeCode),
        getPlaceReviews(placeCode, 10),
      ]);
      setPlace(placeData);
      setCheckInDone(placeData.user_has_checked_in === true);
      setReviews(reviewsData.reviews ?? []);
      setAverageRating(reviewsData.average_rating);
      setReviewCount(reviewsData.review_count);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error');
      setError(msg);
      setPlace(null);
      setReviews([]);
      if (msg.toLowerCase().includes('not found') || msg === 'Place not found') setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [placeCode, t]);

  useEffect(() => {
    fetchPlace();
  }, [fetchPlace]);

  const doActualToggleFavorite = useCallback(async () => {
    if (!placeCode || !place) return;
    setFavoriteLoading(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (place.is_favorite) await removeFavorite(placeCode);
      else await addFavorite(placeCode);
      setPlace((p) => (p ? { ...p, is_favorite: !p.is_favorite } : null));
    } catch {
      // keep state
    } finally {
      setFavoriteLoading(false);
    }
  }, [placeCode, place]);

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
      setTimeout(() => setCheckInDone(true), 430);
    } catch (err) {
      Alert.alert(
        t('places.checkInFailed'),
        err instanceof Error ? err.message : t('places.tryAgain'),
      );
    } finally {
      setCheckInLoading(false);
    }
  }, [placeCode, checkInLoading, checkInDone, checkInScale, t]);

  const handleCheckIn = useCallback(() => {
    requireAuth(() => doActualCheckIn(), 'visitor.loginRequired');
  }, [requireAuth, doActualCheckIn]);

  const renderCheckInBtn = () => {
    if (checkInDone) {
      return (
        <View style={styles.checkedInBadge}>
          <MaterialIcons name="check-circle" size={16} color="#059669" />
          <Text style={styles.checkedInText} numberOfLines={1}>
            {checkInDate ? `${t('places.checkedIn')} ${checkInDate}` : t('places.checkedIn')}
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

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="small" color={tokens.colors.primary} />
        <Text style={styles.muted}>{t('common.loading')}</Text>
      </View>
    );
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

  const heroImage = getFullImageUrl(place.images?.[0]?.url);
  const formatDist = (km: number) =>
    km < 1
      ? t('common.distanceMeters').replace('{count}', String(Math.round(km * 1000)))
      : t('common.distanceKm').replace('{count}', km.toFixed(1));

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
      <Animated.View style={[styles.heroFixed, { transform: [{ translateY: heroTranslateY }] }]}>
        {heroImage ? (
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
            onPress={() => shareUrl(place.name, `places/${placeCode}`)}
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
          />

          {/* The Story */}
          {place.description ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: textMuted }]}>
                {t('placeDetail.theStory')}
              </Text>
              <Text
                style={[styles.description, { color: textSecondary }]}
                numberOfLines={storyExpanded ? undefined : 5}
              >
                {place.description}
              </Text>
              <TouchableOpacity onPress={() => setStoryExpanded((v) => !v)} activeOpacity={0.7}>
                <Text style={styles.readMore}>
                  {storyExpanded ? t('common.readLess') : t('common.readMore')}
                </Text>
              </TouchableOpacity>
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
            <PlaceTimingsCarousel timings={timings} title={carouselTitle} />
          ) : null}

          {/* Facilities / Specifications */}
          {specifications.length > 0 ? (
            <PlaceSpecificationsGrid specifications={specifications} t={t} />
          ) : null}

          {/* Reviews */}
          <PlaceReviewsList
            placeCode={placeCode}
            reviews={reviews}
            userCode={user?.user_code}
            averageRating={averageRating}
            reviewCount={reviewCount}
            onRefresh={fetchPlace}
          />
        </View>
      </Animated.ScrollView>

      {/* Sticky Footer */}
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
        <TouchableOpacity
          style={styles.footerBtnSecondary}
          onPress={() => place && openDirections(place.lat, place.lng, place.name)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="directions" size={16} color={tokens.colors.primary} />
          <Text style={styles.footerBtnSecondaryText}>{t('placeDetail.directions')}</Text>
        </TouchableOpacity>
        {renderCheckInBtn()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.backgroundLight },
  scroll: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  errorContainer: { paddingHorizontal: 24, alignItems: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '600', color: tokens.colors.textMain, marginBottom: 8 },
  muted: { fontSize: 14, color: tokens.colors.textMuted },
  link: { color: tokens.colors.primary, fontWeight: '600', marginTop: 8 },
  retryButton: { marginTop: 12 },
  retryText: { color: tokens.colors.primary, fontWeight: '600' },
  backButton: { marginTop: 8 },
  backButtonText: { color: tokens.colors.textSecondary, fontWeight: '600' },

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
    backgroundColor: tokens.colors.backgroundLight,
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
    backgroundColor: tokens.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
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
    backgroundColor: tokens.colors.inputBorder,
  },
  scorecardValue: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.colors.textMain,
    textAlign: 'center',
  },
  scorecardLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.colors.textMuted,
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
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 16,
  },
  description: {
    fontSize: 15,
    color: tokens.colors.textSecondary,
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
    backgroundColor: tokens.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
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
    color: tokens.colors.textMain,
  },
  hoursTodayValue: {
    fontSize: 14,
    color: tokens.colors.textSecondary,
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
    color: tokens.colors.textSecondary,
  },
  hoursDayToday: {
    fontWeight: '600',
    color: tokens.colors.primary,
  },
  hoursValue: {
    fontSize: 14,
    color: tokens.colors.textSecondary,
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
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    ...tokens.shadow.subtle,
  },
  specLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  specValue: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colors.textMain,
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
    color: tokens.colors.textMain,
  },
  reviewMetaMuted: {
    fontSize: 12,
    color: tokens.colors.textMuted,
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
    borderColor: tokens.colors.inputBorder,
    backgroundColor: tokens.colors.surface,
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
    color: tokens.colors.textMain,
    fontSize: 14,
  },
  reviewDate: { fontSize: 12, color: tokens.colors.textMuted },
  reviewCardRight: { alignItems: 'flex-end' },
  starRow: { flexDirection: 'row', gap: 2 },
  star: { fontSize: 13, color: '#f59e0b' },
  reviewActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  reviewActionBtn: { paddingVertical: 2 },
  reviewActionEdit: { fontSize: 13, color: tokens.colors.primary, fontWeight: '600' },
  reviewActionDelete: { fontSize: 13, color: '#dc2626', fontWeight: '600' },
  reviewTitle: {
    fontWeight: '600',
    color: tokens.colors.textMain,
    marginBottom: 4,
    fontSize: 14,
  },
  reviewBody: { fontSize: 14, color: tokens.colors.textSecondary, lineHeight: 20 },
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
    backgroundColor: tokens.colors.surface,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.inputBorder,
  },
  footerBtnSecondary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: tokens.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  footerBtnSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colors.primary,
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
});
