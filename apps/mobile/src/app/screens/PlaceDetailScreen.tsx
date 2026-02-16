import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import {
  getPlace,
  getPlaceReviews,
  addFavorite,
  removeFavorite,
  deleteReview,
  checkIn as doCheckIn,
} from '../../lib/api/client';
import { shareUrl, openDirections } from '../../lib/share';
import { useAuth } from '../providers';
import { useI18n } from '../providers';
import type { RootStackParamList } from '../navigation';
import type { PlaceDetail as PlaceDetailType, Review, PlaceSpecification } from '../../lib/types';
import { tokens } from '../../lib/theme';
import TimingCircle from '../../components/places/TimingCircle';
import DeityCircle from '../../components/places/DeityCircle';
import { crowdColor } from '../../lib/utils/crowdColor';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>;
type PlaceDetailRoute = RouteProp<RootStackParamList, 'PlaceDetail'>;

const HERO_HEIGHT = 300;
const CARD_OVERLAP = 0;

export default function PlaceDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<PlaceDetailRoute>();
  const { placeCode } = route.params;
  const { user } = useAuth();
  const { t } = useI18n();

  const [place, setPlace] = useState<PlaceDetailType | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState<number | undefined>();
  const [reviewCount, setReviewCount] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInDone, setCheckInDone] = useState(false);
  const [checkInDate, setCheckInDate] = useState('');
  const [storyExpanded, setStoryExpanded] = useState(false);

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

  const toggleFavorite = useCallback(async () => {
    if (!placeCode || !place) return;
    setFavoriteLoading(true);
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

  const handleDeleteReview = (reviewCode: string) => {
    Alert.alert(
      t('reviews.deleteTitle'),
      t('reviews.deleteWarning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setDeletingCode(reviewCode);
            try {
              await deleteReview(reviewCode);
              fetchPlace();
            } catch {
              // ignore
            } finally {
              setDeletingCode(null);
            }
          },
        },
      ]
    );
  };

  const handleCheckIn = useCallback(async () => {
    if (!placeCode || checkInLoading || checkInDone) return;
    setCheckInLoading(true);
    try {
      const result = await doCheckIn(placeCode);
      Animated.sequence([
        Animated.timing(checkInScale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
        Animated.timing(checkInScale, { toValue: 1.06, duration: 200, useNativeDriver: true }),
        Animated.timing(checkInScale, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
      const date = new Date(result.checked_in_at).toLocaleDateString('en-US', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
      setCheckInDate(date);
      setTimeout(() => setCheckInDone(true), 430);
    } catch (err) {
      Alert.alert('Check-in failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setCheckInLoading(false);
    }
  }, [placeCode, checkInLoading, checkInDone, checkInScale]);

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
          style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
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

  const userReview = user ? reviews.find((r) => r.user_code === user.user_code) : null;

  if (!placeCode) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>Missing place.</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Main')}>
          <Text style={styles.link}>Home</Text>
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
        <Text style={styles.errorTitle}>Place not found</Text>
        <Text style={styles.muted}>{error}</Text>
        <TouchableOpacity onPress={fetchPlace} style={styles.retryButton}>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Main')} style={styles.backButton}>
          <Text style={styles.backButtonText}>Home</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (!place) return null;

  const heroImage = place.images?.[0]?.url;
  const formatDist = (km: number) =>
    km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

  const timings: PlaceTiming[] = place.timings ?? [];
  const specifications: PlaceSpecification[] = place.specifications ?? [];
  const crowdLevel = (place as PlaceDetailType & { crowd_level?: string }).crowd_level;
  const totalCheckins = (place as PlaceDetailType & { total_checkins_count?: number }).total_checkins_count;

  const renderTimingItem = (item: PlaceTiming, i: number) => {
    if (item.type === 'deity') return <DeityCircle key={i} item={item} />;
    return <TimingCircle key={i} item={item} />;
  };

  const carouselTitle =
    place.religion === 'islam' ? t('placeDetail.prayerTimes') :
    place.religion === 'hinduism' ? t('placeDetail.divinePresence') :
    t('placeDetail.serviceTimes');

  return (
    <View style={styles.container}>
      {/* Hero (fixed behind content) */}
      <Animated.View
        style={[
          styles.heroFixed,
          { transform: [{ translateY: heroTranslateY }] },
        ]}
      >
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
            {place.is_open_now != null && (
              <View style={[styles.heroBadge, place.is_open_now ? styles.heroBadgeOpen : styles.heroBadgeClosed]}>
                <View style={[styles.heroBadgeDot, { backgroundColor: place.is_open_now ? '#4ade80' : '#f87171' }]} />
                <Text style={styles.heroBadgeText}>
                  {place.is_open_now ? t('places.openNow') : t('places.closed')}
                </Text>
              </View>
            )}
            {averageRating != null && (
              <View style={[styles.heroBadge, styles.heroBadgeRating]}>
                <MaterialIcons name="star" size={12} color="#fbbf24" />
                <Text style={styles.heroBadgeText}>{averageRating.toFixed(1)}</Text>
              </View>
            )}
          </View>
          <Text style={styles.heroName}>{place.name}</Text>
          {place.address ? (
            <Text style={styles.heroAddress}>{place.address}</Text>
          ) : null}
        </View>
      </Animated.View>

      {/* Sticky Header (fades in as user scrolls past hero) */}
      <Animated.View
        style={[styles.stickyHeader, { opacity: headerOpacity, paddingTop: insets.top }]}
        pointerEvents="none"
      >
        <Text style={styles.stickyHeaderTitle} numberOfLines={1}>{place.name}</Text>
      </Animated.View>

      {/* Top bar buttons (always visible) */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.circleBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.circleBtn} onPress={() => shareUrl(place.name, `places/${placeCode}`)} activeOpacity={0.8}>
            <MaterialIcons name="share" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.circleBtn} onPress={toggleFavorite} disabled={favoriteLoading} activeOpacity={0.8}>
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
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >
        {/* Spacer to push card below hero */}
        <View style={styles.heroSpacer} />

        {/* Card */}
        <View style={styles.card}>
          {/* Scorecards */}
          <View style={styles.scorecardRow}>
            <TouchableOpacity
              style={styles.scorecard}
              onPress={() => place && openDirections(place.lat, place.lng, place.name)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="directions" size={20} color={tokens.colors.primary} />
              <Text style={styles.scorecardValue}>
                {place.distance != null ? formatDist(place.distance) : '—'}
              </Text>
              <Text style={styles.scorecardLabel}>{t('placeDetail.distance')}</Text>
            </TouchableOpacity>

            <View style={styles.scorecardDivider} />

            <View style={styles.scorecard}>
              <MaterialIcons
                name="people"
                size={20}
                color={crowdColor(crowdLevel)}
              />
              <Text style={[styles.scorecardValue, { color: crowdColor(crowdLevel) }]}>
                {crowdLevel ?? '—'}
              </Text>
              <Text style={styles.scorecardLabel}>{t('placeDetail.crowd')}</Text>
            </View>

            <View style={styles.scorecardDivider} />

            <View style={styles.scorecard}>
              <MaterialIcons name="check-circle-outline" size={20} color={tokens.colors.primary} />
              <Text style={styles.scorecardValue}>
                {totalCheckins != null ? totalCheckins.toString() : '—'}
              </Text>
              <Text style={styles.scorecardLabel}>{t('placeDetail.visits')}</Text>
            </View>
          </View>

          {/* The Story */}
          {place.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('placeDetail.theStory')}</Text>
              <Text
                style={styles.description}
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

          {/* Religion-specific carousel */}
          {timings.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{carouselTitle}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carouselContent}
              >
                {timings.map((item, i) => renderTimingItem(item, i))}
              </ScrollView>
            </View>
          ) : null}

          {/* Facilities / Specifications */}
          {specifications.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('placeDetail.detailsAndFacilities')}</Text>
              <View style={styles.specsGrid}>
                {specifications.map((spec, i) => (
                  <View key={i} style={styles.specCard}>
                    <MaterialIcons
                      name={spec.icon as any}
                      size={20}
                      color={tokens.colors.primary}
                      style={{ marginBottom: 6 }}
                    />
                    <Text style={styles.specLabel}>{t(spec.label)}</Text>
                    <Text style={styles.specValue}>{spec.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Reviews */}
          <View style={styles.section}>
            <View style={styles.reviewHeader}>
              <Text style={styles.sectionTitle}>{t('placeDetail.recentReviews')}</Text>
              {(averageRating != null || (reviewCount != null && reviewCount > 0)) && (
                <View style={styles.reviewMeta}>
                  <MaterialIcons name="star" size={14} color="#f59e0b" />
                  <Text style={styles.reviewMetaText}>{averageRating?.toFixed(1) ?? '—'}</Text>
                  <Text style={styles.reviewMetaMuted}>({reviewCount ?? 0})</Text>
                </View>
              )}
            </View>

            {userReview ? (
              <TouchableOpacity
                onPress={() => navigation.navigate('WriteReview', {
                  placeCode,
                  reviewCode: userReview.review_code,
                  rating: userReview.rating,
                  title: userReview.title ?? '',
                  body: userReview.body ?? '',
                })}
                style={styles.writeReviewLink}
              >
                <Text style={styles.writeReviewLinkText}>Edit your review</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => navigation.navigate('WriteReview', { placeCode })}
                style={styles.writeReviewLink}
              >
                <Text style={styles.writeReviewLinkText}>{t('places.writeReview')}</Text>
              </TouchableOpacity>
            )}

            {reviews.length === 0 ? (
              <Text style={styles.muted}>{t('places.noReviewsYet')}</Text>
            ) : (
              <View style={styles.reviewList}>
                {reviews.slice(0, 5).map((r) => (
                  <View key={r.review_code} style={styles.reviewCard}>
                    <View style={styles.reviewCardHeader}>
                      <View style={styles.reviewAvatar}>
                        <Text style={styles.reviewAvatarText}>
                          {(r.display_name || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.reviewCardMeta}>
                        <Text style={styles.reviewAuthor}>{r.display_name || 'Visitor'}</Text>
                        <Text style={styles.reviewDate}>
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                        </Text>
                      </View>
                      <View style={styles.reviewCardRight}>
                        <View style={styles.starRow}>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <Text key={i} style={styles.star}>
                              {i <= r.rating ? '★' : '☆'}
                            </Text>
                          ))}
                        </View>
                        {user && r.user_code === user.user_code && (
                          <View style={styles.reviewActions}>
                            <TouchableOpacity
                              onPress={() =>
                                navigation.navigate('WriteReview', {
                                  placeCode,
                                  reviewCode: r.review_code,
                                  rating: r.rating,
                                  title: r.title ?? '',
                                  body: r.body ?? '',
                                })
                              }
                              style={styles.reviewActionBtn}
                            >
                              <Text style={styles.reviewActionEdit}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDeleteReview(r.review_code)}
                              disabled={deletingCode === r.review_code}
                              style={styles.reviewActionBtn}
                            >
                              <Text style={styles.reviewActionDelete}>Delete</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                    {r.title ? <Text style={styles.reviewTitle}>{r.title}</Text> : null}
                    {r.body ? <Text style={styles.reviewBody}>{r.body}</Text> : null}
                    {r.photo_urls && r.photo_urls.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.reviewPhotos}
                        contentContainerStyle={styles.reviewPhotosContent}
                      >
                        {r.photo_urls.map((url, i) => (
                          <ExpoImage
                            key={i}
                            source={{ uri: url }}
                            style={styles.reviewPhoto}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={200}
                          />
                        ))}
                      </ScrollView>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </Animated.ScrollView>

      {/* Sticky Footer */}
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 12, paddingTop: 12, paddingHorizontal: 16 },
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
    fontSize: 17,
    fontWeight: '700',
    color: tokens.colors.textMain,
    marginBottom: 12,
    letterSpacing: -0.2,
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
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: tokens.colors.primary,
    alignItems: 'center',
  },
  footerBtnPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
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
