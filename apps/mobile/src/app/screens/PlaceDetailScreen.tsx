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
  Linking,
  Animated,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
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
import type { PlaceDetail as PlaceDetailType, Review } from '../../lib/types';
import { tokens } from '../../lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>;
type PlaceDetailRoute = RouteProp<RootStackParamList, 'PlaceDetail'>;

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
  const checkInScale = useRef(new Animated.Value(1)).current;

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
      'Delete review?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
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

  const handleDirections = () => {
    if (place) openDirections(place.lat, place.lng, place.name);
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

  const renderCheckInBtn = (btnBg?: string, isCta = false) => {
    if (checkInDone) {
      return (
        <View style={isCta ? styles.checkedInCtaBadge : styles.checkedInBadge}>
          <MaterialIcons name="check-circle" size={16} color="#059669" />
          <Text style={isCta ? styles.checkedInCtaText : styles.checkedInText} numberOfLines={1}>
            {checkInDate ? `Checked in ${checkInDate}` : 'Checked in'}
          </Text>
        </View>
      );
    }
    if (isCta) {
      return (
        <Animated.View style={[variantStyles.ctaButton, { transform: [{ scale: checkInScale }] }]}>
          <TouchableOpacity
            style={{ width: '100%', alignItems: 'center' }}
            onPress={handleCheckIn}
            disabled={checkInLoading}
            activeOpacity={0.8}
          >
            {checkInLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={variantStyles.ctaButtonText}>{t('placeDetail.startPilgrimage')}</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      );
    }
    return (
      <Animated.View style={[styles.footerBtnPrimary, btnBg ? { backgroundColor: btnBg } : {}, { transform: [{ scale: checkInScale }] }]}>
        <TouchableOpacity
          style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
          onPress={handleCheckIn}
          disabled={checkInLoading}
          activeOpacity={0.8}
        >
          {checkInLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.footerBtnPrimaryText}>{t('places.checkIn')}</Text>
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
        <ActivityIndicator size="small" color="#0d9488" />
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

  const isMosque = place.religion === 'islam';
  const heroImage = place.image_urls?.[0];
  const rs = (place.religion_specific ?? {}) as Record<string, unknown>;
  const prayerTimes = (rs.prayer_times as Record<string, string> | undefined) ?? {};
  const getPrayer = (key: string) =>
    prayerTimes[key] ?? prayerTimes[key.toLowerCase()] ?? prayerTimes[key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()] ?? '';
  const prayerList = [
    { key: 'fajr', labelKey: 'placeDetail.fajr' },
    { key: 'dhuhr', labelKey: 'placeDetail.dhuhr' },
    { key: 'asr', labelKey: 'placeDetail.asr' },
    { key: 'maghrib', labelKey: 'placeDetail.maghrib' },
    { key: 'isha', labelKey: 'placeDetail.isha' },
  ] as const;
  const hasPrayerTimes = prayerList.some((p) => getPrayer(p.key));
  const capacity = rs.capacity != null ? String(rs.capacity) : null;
  const wuduArea = rs.wudu_area != null ? String(rs.wudu_area) : (Array.isArray(rs.facilities) && (rs.facilities as string[]).some((f) => /wudu|ablution/i.test(f)) ? 'Available' : null);
  const parking = rs.parking != null ? String(rs.parking) : null;
  const womensArea = rs.womens_area != null ? String(rs.womens_area) : (Array.isArray(rs.facilities) && (rs.facilities as string[]).some((f) => /women|female/i.test(f)) ? 'Separate' : null);
  const formatDist = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

  const isTemple = place.religion === 'hinduism';
  const isChurch = place.religion === 'christianity';
  const todayKey = new Date().toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase();
  const openingHoursMap: Record<string, string> = {};
  if (place.opening_hours) {
    Object.entries(place.opening_hours).forEach(([k, v]) => {
      openingHoursMap[k.toLowerCase()] = v;
    });
  }
  const opensAtToday = openingHoursMap[todayKey] ?? place.opening_hours?.[todayKey] ?? '';
  const deities = (Array.isArray(rs.deities) ? rs.deities : []) as { name?: string; subtitle?: string; image_url?: string }[];
  const architecture = rs.architecture != null ? String(rs.architecture) : null;
  const nextFestival = rs.next_festival != null ? String(rs.next_festival) : null;
  const dressCode = rs.dress_code != null ? String(rs.dress_code) : null;
  const dressCodeNotes = rs.dress_code_notes != null ? String(rs.dress_code_notes) : null;
  const crowdLevel = rs.crowd_level != null ? String(rs.crowd_level) : null;
  const foundedYear = rs.founded_year != null ? String(rs.founded_year) : null;
  const style = rs.style != null ? String(rs.style) : null;
  const serviceTimes = (rs.service_times as { day?: string; name?: string; time?: string }[] | Record<string, string>) ?? {};
  const serviceTimesArray = Array.isArray(serviceTimes) ? serviceTimes : Object.entries(serviceTimes).map(([day, v]) => ({ day, time: typeof v === 'string' ? v : (v as { time?: string })?.time ?? '' }));
  const websiteUrl = (rs.website_url as string) ?? (place as { website_url?: string }).website_url ?? null;

  if (isMosque) {
    return (
      <View style={[styles.container, { backgroundColor: tokens.colors.backgroundLight }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={mosqueStyles.hero}>
            {heroImage ? (
              <Image source={{ uri: heroImage }} style={mosqueStyles.heroImage} resizeMode="cover" />
            ) : (
              <View style={mosqueStyles.heroPlaceholder}>
                <MaterialIcons name="location-city" size={56} color={tokens.colors.textMuted} />
              </View>
            )}
            <View style={mosqueStyles.heroOverlay} pointerEvents="none" />
            <View style={[mosqueStyles.heroTopBar, { paddingTop: insets.top + 16 }]}>
              <TouchableOpacity style={mosqueStyles.heroCircleBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
                <MaterialIcons name="arrow-back" size={20} color="#fff" />
              </TouchableOpacity>
              <View style={mosqueStyles.heroTopRight}>
                <TouchableOpacity style={mosqueStyles.heroCircleBtn} onPress={() => shareUrl(place.name, `places/${placeCode}`)} activeOpacity={0.8}>
                  <MaterialIcons name="share" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={mosqueStyles.heroCircleBtn} onPress={toggleFavorite} disabled={favoriteLoading} activeOpacity={0.8}>
                  <MaterialIcons name={place.is_favorite ? 'favorite' : 'favorite-border'} size={20} color={place.is_favorite ? '#ef4444' : '#fff'} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={mosqueStyles.heroBottom}>
              <View style={mosqueStyles.heroBadges}>
                {place.is_open_now && (
                  <View style={mosqueStyles.openNowBadge}>
                    <Text style={mosqueStyles.openNowText}>{t('places.openNow')}</Text>
                  </View>
                )}
                {place.distance != null && (
                  <View style={mosqueStyles.distanceBadge}>
                    <Text style={mosqueStyles.distanceBadgeText}>{formatDist(place.distance)}</Text>
                  </View>
                )}
              </View>
              <Text style={mosqueStyles.heroName}>{place.name}</Text>
              {place.address ? (
                <Text style={mosqueStyles.heroAddress}>{place.address}</Text>
              ) : null}
            </View>
          </View>

          <View style={mosqueStyles.body}>
            {hasPrayerTimes && (
              <View style={mosqueStyles.section}>
                <Text style={mosqueStyles.sectionTitle}>{t('placeDetail.prayerTimes')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={mosqueStyles.prayerRow}>
                  {prayerList.map(({ key, labelKey }) => (
                    <View key={key} style={mosqueStyles.prayerItem}>
                      <Text style={mosqueStyles.prayerLabel}>{t(labelKey)}</Text>
                      <Text style={mosqueStyles.prayerTime}>{getPrayer(key) || '—'}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {place.description ? (
              <View style={mosqueStyles.section}>
                <Text style={mosqueStyles.sectionTitle}>{t('placeDetail.about')}</Text>
                <Text style={mosqueStyles.description} numberOfLines={4}>{place.description}</Text>
                <Text style={mosqueStyles.readFullStory}>{t('placeDetail.readFullStory')}</Text>
              </View>
            ) : null}

            {(capacity || wuduArea || parking || womensArea) ? (
              <View style={mosqueStyles.section}>
                <Text style={mosqueStyles.sectionTitle}>{t('placeDetail.detailsAndFacilities')}</Text>
                <View style={mosqueStyles.facilitiesGrid}>
                  {capacity ? (
                    <View style={mosqueStyles.facilityCard}>
                      <Text style={mosqueStyles.facilityLabel}>{t('placeDetail.capacity')}</Text>
                      <Text style={mosqueStyles.facilityValue}>{capacity}</Text>
                    </View>
                  ) : null}
                  {wuduArea ? (
                    <View style={mosqueStyles.facilityCard}>
                      <Text style={mosqueStyles.facilityLabel}>{t('placeDetail.wuduArea')}</Text>
                      <Text style={mosqueStyles.facilityValue}>{wuduArea}</Text>
                    </View>
                  ) : null}
                  {parking ? (
                    <View style={mosqueStyles.facilityCard}>
                      <Text style={mosqueStyles.facilityLabel}>{t('placeDetail.parking')}</Text>
                      <Text style={mosqueStyles.facilityValue}>{parking}</Text>
                    </View>
                  ) : null}
                  {womensArea ? (
                    <View style={mosqueStyles.facilityCard}>
                      <Text style={mosqueStyles.facilityLabel}>{t('placeDetail.womensArea')}</Text>
                      <Text style={mosqueStyles.facilityValue}>{womensArea}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={mosqueStyles.section}>
              <Text style={mosqueStyles.sectionTitle}>{t('placeDetail.recentReviews')}</Text>
              <Text style={mosqueStyles.whatPeopleSay}>{t('placeDetail.whatPeopleSay')}</Text>
              {(averageRating != null || (reviewCount != null && reviewCount > 0)) && (
                <View style={mosqueStyles.reviewMeta}>
                  <Text style={mosqueStyles.reviewMetaText}>★ {averageRating?.toFixed(1) ?? '—'}</Text>
                  <Text style={mosqueStyles.reviewMetaMuted}>{reviewCount ?? 0} reviews</Text>
                </View>
              )}
              {userReview ? (
                <TouchableOpacity onPress={() => navigation.navigate('WriteReview', { placeCode, reviewCode: userReview.review_code, rating: userReview.rating, title: userReview.title ?? '', body: userReview.body ?? '' })} style={styles.writeReviewLink}>
                  <Text style={styles.writeReviewLinkText}>Edit your review</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => navigation.navigate('WriteReview', { placeCode })} style={styles.writeReviewLink}>
                  <Text style={styles.writeReviewLinkText}>{t('places.writeReview')}</Text>
                </TouchableOpacity>
              )}
              {reviews.length === 0 ? (
                <Text style={styles.muted}>{t('places.noReviewsYet')}</Text>
              ) : (
                <View style={styles.reviewList}>
                  {reviews.slice(0, 3).map((r) => (
                    <View key={r.review_code} style={styles.reviewCard}>
                      <View style={styles.reviewCardHeader}>
                        <View style={styles.reviewAvatar}>
                          <Text style={styles.reviewAvatarText}>{(r.display_name || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={styles.reviewCardMeta}>
                          <Text style={styles.reviewAuthor}>{r.display_name || 'Visitor'}</Text>
                          <Text style={styles.reviewDate}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</Text>
                        </View>
                        <View style={styles.reviewCardRight}>
                          <View style={styles.starRowSmall}>
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Text key={i} style={styles.starSmall}>{i <= r.rating ? '★' : '☆'}</Text>
                            ))}
                          </View>
                        </View>
                      </View>
                      {r.body ? <Text style={styles.reviewBody}>{r.body}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, paddingTop: 12, paddingHorizontal: 24, backgroundColor: tokens.colors.surface, borderTopColor: tokens.colors.inputBorder }]}>
          <TouchableOpacity style={[styles.footerBtn, { borderColor: tokens.colors.inputBorder }]} onPress={() => handleDirections()} activeOpacity={0.8}>
            <MaterialIcons name="directions" size={16} color={tokens.colors.textMain} />
            <Text style={[styles.footerBtnText, { color: tokens.colors.textMain, marginLeft: 6 }]}>{t('placeDetail.directions')}</Text>
          </TouchableOpacity>
          {renderCheckInBtn(tokens.colors.primary)}
        </View>
      </View>
    );
  }

  if (isTemple) {
    return (
      <View style={[styles.container, { backgroundColor: tokens.colors.surface }]}>
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
          <View style={variantStyles.heroTall}>
            {heroImage ? <Image source={{ uri: heroImage }} style={variantStyles.heroImage} resizeMode="cover" /> : <View style={variantStyles.heroPlaceholder}><MaterialIcons name="account-balance" size={64} color={tokens.colors.textMuted} /></View>}
            <View style={variantStyles.heroOverlay} pointerEvents="none" />
            <View style={[variantStyles.heroTopBar, { paddingTop: insets.top + 16 }]}>
              <TouchableOpacity style={variantStyles.heroCircleBtn} onPress={() => navigation.goBack()}><MaterialIcons name="arrow-back" size={20} color="#fff" /></TouchableOpacity>
              <View style={variantStyles.heroTopRight}>
                <TouchableOpacity style={variantStyles.heroCircleBtn} onPress={() => shareUrl(place.name, `places/${placeCode}`)}><MaterialIcons name="share" size={20} color="#fff" /></TouchableOpacity>
                <TouchableOpacity style={variantStyles.heroCircleBtn} onPress={toggleFavorite} disabled={favoriteLoading}><MaterialIcons name={place.is_favorite ? 'favorite' : 'favorite-border'} size={20} color={place.is_favorite ? '#ef4444' : '#fff'} /></TouchableOpacity>
              </View>
            </View>
            <View style={variantStyles.heroBottom}>
              <View style={variantStyles.heroBadgeRow}>
                <View style={variantStyles.typeBadge}><Text style={variantStyles.typeBadgeText}>{t('placeDetail.hinduTemple')}</Text></View>
                {averageRating != null && <View style={variantStyles.ratingBadge}><Text style={variantStyles.ratingBadgeText}>★ {averageRating.toFixed(1)}</Text></View>}
              </View>
              <Text style={variantStyles.heroNameLarge}>{place.name}</Text>
              {place.address ? <Text style={variantStyles.heroAddress}>{place.address}</Text> : null}
            </View>
          </View>
          <View style={variantStyles.body}>
            <View style={variantStyles.infoRow}>
              <View style={variantStyles.infoCell}>
                <Text style={variantStyles.infoLabel}>{t('placeDetail.opensAt')}</Text>
                <Text style={variantStyles.infoValue}>{opensAtToday || '—'}</Text>
              </View>
              <View style={variantStyles.infoDivider} />
              <View style={variantStyles.infoCell}>
                <Text style={variantStyles.infoLabel}>{t('placeDetail.distance')}</Text>
                <Text style={variantStyles.infoValue}>{place.distance != null ? formatDist(place.distance) : '—'}</Text>
              </View>
              <View style={variantStyles.infoDivider} />
              <View style={variantStyles.infoCell}>
                <Text style={variantStyles.infoLabel}>{t('placeDetail.crowd')}</Text>
                <Text style={[variantStyles.infoValue, { color: '#059669' }]}>{crowdLevel || '—'}</Text>
              </View>
            </View>
            {place.description ? (
              <View style={variantStyles.section}>
                <Text style={variantStyles.sectionTitle}>{t('placeDetail.sanctumStory')}</Text>
                <Text style={variantStyles.description} numberOfLines={3}>{place.description}</Text>
                <Text style={variantStyles.readMore}>{t('common.readMore')}</Text>
              </View>
            ) : null}
            {deities.length > 0 ? (
              <View style={variantStyles.section}>
                <Text style={variantStyles.sectionTitle}>{t('placeDetail.divinePresence')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={variantStyles.deitiesRow}>
                  {deities.map((d, i) => (
                    <View key={i} style={variantStyles.deityItem}>
                      <View style={variantStyles.deityCircle}>
                        {d.image_url ? <Image source={{ uri: d.image_url }} style={variantStyles.deityImage} /> : <Text style={variantStyles.deityPlaceholder}>🛕</Text>}
                      </View>
                      <Text style={variantStyles.deityName}>{d.name ?? 'Deity'}</Text>
                      {d.subtitle ? <Text style={variantStyles.deitySubtitle}>{d.subtitle}</Text> : null}
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {(architecture || nextFestival || dressCode) ? (
              <View style={variantStyles.section}>
                <Text style={variantStyles.sectionTitle}>{t('placeDetail.essentialInfo')}</Text>
                <View style={variantStyles.facilitiesRow}>
                  {architecture ? <View style={variantStyles.facilityCard}><Text style={variantStyles.facilityLabel}>{t('placeDetail.architecture')}</Text><Text style={variantStyles.facilityValue}>{architecture}</Text></View> : null}
                  {nextFestival ? <View style={variantStyles.facilityCard}><Text style={variantStyles.facilityLabel}>{t('placeDetail.nextFestival')}</Text><Text style={variantStyles.facilityValue}>{nextFestival}</Text></View> : null}
                  {dressCode ? <View style={[variantStyles.facilityCard, variantStyles.dressCard]}><Text style={variantStyles.facilityLabel}>{t('placeDetail.dressCode')}</Text><Text style={variantStyles.facilityValue}>{dressCode}</Text>{dressCodeNotes ? <Text style={variantStyles.facilityNotes}>{dressCodeNotes}</Text> : null}</View> : null}
                </View>
              </View>
            ) : null}
            <View style={variantStyles.section}>
              <Text style={variantStyles.sectionTitle}>{t('placeDetail.pilgrimVoices')}</Text>
              {userReview ? <TouchableOpacity onPress={() => navigation.navigate('WriteReview', { placeCode, reviewCode: userReview.review_code, rating: userReview.rating, title: userReview.title ?? '', body: userReview.body ?? '' })} style={styles.writeReviewLink}><Text style={styles.writeReviewLinkText}>Edit your review</Text></TouchableOpacity> : <TouchableOpacity onPress={() => navigation.navigate('WriteReview', { placeCode })} style={styles.writeReviewLink}><Text style={styles.writeReviewLinkText}>{t('places.writeReview')}</Text></TouchableOpacity>}
              {reviews.length === 0 ? <Text style={styles.muted}>{t('places.noReviewsYet')}</Text> : <View style={styles.reviewList}>{reviews.slice(0, 3).map((r) => (<View key={r.review_code} style={styles.reviewCard}><View style={styles.reviewCardHeader}><View style={styles.reviewAvatar}><Text style={styles.reviewAvatarText}>{(r.display_name || '?').charAt(0).toUpperCase()}</Text></View><View style={styles.reviewCardMeta}><Text style={styles.reviewAuthor}>{r.display_name || 'Visitor'}</Text><Text style={styles.reviewDate}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</Text></View><View style={styles.reviewCardRight}><View style={styles.starRowSmall}>{[1,2,3,4,5].map((i) => <Text key={i} style={styles.starSmall}>{i <= r.rating ? '★' : '☆'}</Text>)}</View></View></View>{r.body ? <Text style={styles.reviewBody}>{r.body}</Text> : null}</View>))}</View>}
            </View>
          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, paddingTop: 12, paddingHorizontal: 24, backgroundColor: tokens.colors.surface, borderTopColor: tokens.colors.inputBorder }]}>
          <TouchableOpacity style={[styles.footerBtn, { borderColor: tokens.colors.inputBorder }]} onPress={() => handleDirections()}><Text style={[styles.footerBtnText, { color: tokens.colors.textMain }]}>{t('placeDetail.directions')}</Text></TouchableOpacity>
          {renderCheckInBtn(tokens.colors.primary)}
        </View>
      </View>
    );
  }

  if (isChurch) {
    return (
      <View style={[styles.container, { backgroundColor: tokens.colors.surface }]}>
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
          <View style={variantStyles.hero}>
            {heroImage ? <Image source={{ uri: heroImage }} style={variantStyles.heroImage} resizeMode="cover" /> : <View style={variantStyles.heroPlaceholder}><MaterialIcons name="location-city" size={64} color={tokens.colors.textMuted} /></View>}
            <View style={variantStyles.heroOverlay} pointerEvents="none" />
            <View style={[variantStyles.heroTopBar, { paddingTop: insets.top + 16 }]}>
              <TouchableOpacity style={variantStyles.heroCircleBtn} onPress={() => navigation.goBack()}><MaterialIcons name="arrow-back" size={20} color="#fff" /></TouchableOpacity>
              <View style={variantStyles.heroTopRight}>
                <TouchableOpacity style={variantStyles.heroCircleBtn} onPress={toggleFavorite} disabled={favoriteLoading}><MaterialIcons name={place.is_favorite ? 'favorite' : 'favorite-border'} size={20} color={place.is_favorite ? '#ef4444' : '#fff'} /></TouchableOpacity>
                <TouchableOpacity style={variantStyles.heroCircleBtn} onPress={() => shareUrl(place.name, `places/${placeCode}`)}><MaterialIcons name="share" size={20} color="#fff" /></TouchableOpacity>
              </View>
            </View>
            <View style={variantStyles.heroBottom}>
              <View style={variantStyles.heroBadgeRow}>
                {place.place_type ? <View style={variantStyles.typeBadge}><Text style={variantStyles.typeBadgeText}>{place.place_type}</Text></View> : null}
                {place.is_open_now ? <View style={variantStyles.openBadge}><Text style={variantStyles.openBadgeText}>{t('places.openNow')}</Text></View> : null}
              </View>
              <Text style={variantStyles.heroNameLarge}>{place.name}</Text>
              {place.address ? <Text style={variantStyles.heroAddress}>{place.address}</Text> : null}
            </View>
          </View>
          <View style={variantStyles.body}>
            <View style={variantStyles.statsRow}>
              <View style={variantStyles.statCell}><Text style={variantStyles.statValue}>{averageRating?.toFixed(1) ?? '—'}</Text><Text style={variantStyles.statLabel}>/ 5.0</Text></View>
              <View style={variantStyles.statDivider} />
              <View style={variantStyles.statCell}><Text style={variantStyles.statValue}>{foundedYear ?? '—'}</Text><Text style={variantStyles.statLabel}>{t('placeDetail.founded')}</Text></View>
              <View style={variantStyles.statDivider} />
              <View style={variantStyles.statCell}><Text style={variantStyles.statValue}>{style ?? '—'}</Text><Text style={variantStyles.statLabel}>{t('placeDetail.style')}</Text></View>
            </View>
            <View style={variantStyles.actionRow}>
              <TouchableOpacity style={variantStyles.actionBtnPrimary} onPress={() => handleDirections()}><Text style={variantStyles.actionBtnPrimaryText}>{t('placeDetail.directions')}</Text></TouchableOpacity>
              {websiteUrl ? <TouchableOpacity style={variantStyles.actionBtnSecondary} onPress={() => websiteUrl && Linking.openURL(websiteUrl)}><Text style={variantStyles.actionBtnSecondaryText}>{t('placeDetail.visitWebsite')}</Text></TouchableOpacity> : null}
            </View>
            {place.description ? (<View style={variantStyles.section}><Text style={variantStyles.sectionTitle}>{t('placeDetail.theSanctuary')}</Text><Text style={variantStyles.description}>{place.description}</Text></View>) : null}
            {serviceTimesArray.length > 0 ? (<View style={variantStyles.section}><Text style={variantStyles.sectionTitle}>{t('placeDetail.serviceTimes')}</Text><View style={variantStyles.serviceList}>{serviceTimesArray.map((row: { day?: string; name?: string; time?: string }, i: number) => (<View key={i} style={variantStyles.serviceRow}><Text style={variantStyles.serviceDay}>{row.day ?? ''}</Text><Text style={variantStyles.serviceName}>{row.name ?? ''}</Text><Text style={variantStyles.serviceTime}>{row.time ?? ''}</Text></View>))}</View></View>) : null}
            <View style={variantStyles.section}>
              <Text style={variantStyles.sectionTitle}>{t('placeDetail.pilgrimVoices')}</Text>
              {userReview ? <TouchableOpacity onPress={() => navigation.navigate('WriteReview', { placeCode, reviewCode: userReview.review_code, rating: userReview.rating, title: userReview.title ?? '', body: userReview.body ?? '' })} style={styles.writeReviewLink}><Text style={styles.writeReviewLinkText}>Edit your review</Text></TouchableOpacity> : <TouchableOpacity onPress={() => navigation.navigate('WriteReview', { placeCode })} style={styles.writeReviewLink}><Text style={styles.writeReviewLinkText}>{t('places.writeReview')}</Text></TouchableOpacity>}
              {reviews.length === 0 ? <Text style={styles.muted}>{t('places.noReviewsYet')}</Text> : <View style={styles.reviewList}>{reviews.slice(0, 3).map((r) => (<View key={r.review_code} style={styles.reviewCard}><View style={styles.reviewCardHeader}><View style={styles.reviewAvatar}><Text style={styles.reviewAvatarText}>{(r.display_name || '?').charAt(0).toUpperCase()}</Text></View><View style={styles.reviewCardMeta}><Text style={styles.reviewAuthor}>{r.display_name || 'Visitor'}</Text><Text style={styles.reviewDate}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</Text></View><View style={styles.reviewCardRight}><View style={styles.starRowSmall}>{[1,2,3,4,5].map((i) => <Text key={i} style={styles.starSmall}>{i <= r.rating ? '★' : '☆'}</Text>)}</View></View></View>{r.body ? <Text style={styles.reviewBody}>{r.body}</Text> : null}</View>))}</View>}
            </View>
          </View>
        </ScrollView>
        <View style={[variantStyles.ctaFooter, { paddingBottom: insets.bottom + 12 }]}>
          {renderCheckInBtn(undefined, true)}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {heroImage ? (
            <Image source={{ uri: heroImage }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroPlaceholder}>
              <MaterialIcons name="location-on" size={56} color={tokens.colors.textMuted} />
            </View>
          )}
          <TouchableOpacity
            style={[styles.backButtonHero, { top: insets.top + 8 }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <MaterialIcons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.heroGradient} />
          <View style={styles.heroCaption}>
            <Text style={styles.heroTitle}>{place.name}</Text>
            {place.distance != null && (
              <Text style={styles.heroSub}>
                {place.distance < 1
                  ? `${Math.round(place.distance * 1000)} m away`
                  : `${place.distance.toFixed(1)} km away`}
              </Text>
            )}
          </View>
        </View>

        <View style={[styles.body, { paddingHorizontal: 24 }]}>
          {place.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.description}>{place.description}</Text>
            </View>
          ) : null}

          {place.address ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Address</Text>
              <Text style={styles.muted}>{place.address}</Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.reviewHeader}>
              <Text style={styles.sectionTitle}>{t('places.reviews')}</Text>
              {(averageRating != null || (reviewCount != null && reviewCount > 0)) && (
                <View style={styles.reviewMeta}>
                  {averageRating != null && (
                    <Text style={styles.reviewMetaText}>★ {averageRating.toFixed(1)}</Text>
                  )}
                  {reviewCount != null && reviewCount > 0 && (
                    <Text style={styles.reviewMetaText}>
                      {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
                    </Text>
                  )}
                </View>
              )}
            </View>
            {userReview ? (
              <TouchableOpacity
                style={styles.writeReviewLink}
                onPress={() =>
                  navigation.navigate('WriteReview', {
                    placeCode,
                    reviewCode: userReview.review_code,
                    rating: userReview.rating,
                    title: userReview.title ?? '',
                    body: userReview.body ?? '',
                  })
                }
                activeOpacity={0.8}
              >
                <Text style={styles.writeReviewLinkText}>Edit your review</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.writeReviewLink}
                onPress={() => navigation.navigate('WriteReview', { placeCode })}
                activeOpacity={0.8}
              >
                <Text style={styles.writeReviewLinkText}>{t('places.writeReview')}</Text>
              </TouchableOpacity>
            )}
            {reviews.length === 0 ? (
              <Text style={styles.muted}>{t('places.noReviewsYet')}</Text>
            ) : (
              <View style={styles.reviewList}>
                {reviews.map((r) => (
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
                        <View style={styles.starRowSmall}>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <Text key={i} style={styles.starSmall}>
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
                              activeOpacity={0.8}
                            >
                              <Text style={styles.reviewActionEdit}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDeleteReview(r.review_code)}
                              disabled={deletingCode === r.review_code}
                              style={styles.reviewActionBtn}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.reviewActionDelete}>Delete</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                    {r.title ? <Text style={styles.reviewTitle}>{r.title}</Text> : null}
                    {r.body ? <Text style={styles.reviewBody}>{r.body}</Text> : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 12,
            paddingTop: 12,
            paddingHorizontal: 24,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={() => handleDirections()}
          activeOpacity={0.8}
        >
          <Text style={styles.footerBtnText}>Directions</Text>
        </TouchableOpacity>
        {renderCheckInBtn()}
        <TouchableOpacity
          style={styles.footerIconBtn}
          onPress={() => shareUrl(place.name, `places/${placeCode}`)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="share" size={20} color={tokens.colors.textMain} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.footerIconBtn}
          onPress={toggleFavorite}
          disabled={favoriteLoading}
          activeOpacity={0.8}
        >
          <MaterialIcons name={place.is_favorite ? 'favorite' : 'favorite-border'} size={20} color={place.is_favorite ? '#ef4444' : tokens.colors.textMain} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  scroll: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorContainer: { paddingHorizontal: 24, alignItems: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '600', color: '#111', marginBottom: 8 },
  muted: { fontSize: 14, color: '#6b7280' },
  link: { color: '#0d9488', fontWeight: '600', marginTop: 8 },
  retryButton: { marginTop: 12 },
  retryText: { color: '#0d9488', fontWeight: '600' },
  backButton: { marginTop: 8 },
  backButtonText: { color: '#374151', fontWeight: '600' },
  hero: { height: 220, position: 'relative', backgroundColor: '#e5e7eb' },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderIcon: { fontSize: 48, color: '#9ca3af' },
  backButtonHero: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  backArrow: { color: '#fff', fontSize: 20 },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
    backgroundColor: 'transparent',
  },
  heroCaption: { position: 'absolute', left: 24, right: 24, bottom: 16 },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  body: { paddingTop: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 8 },
  description: { fontSize: 14, color: '#6b7280', lineHeight: 22 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reviewMeta: { flexDirection: 'row', gap: 8 },
  reviewMetaText: { fontSize: 12, color: '#6b7280' },
  writeReviewLink: { marginBottom: 12 },
  writeReviewLinkText: { color: '#0d9488', fontWeight: '600', fontSize: 14 },
  reviewList: { gap: 12 },
  reviewCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  reviewCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(13, 148, 136, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  reviewAvatarText: { fontSize: 14, fontWeight: '600', color: '#0d9488' },
  reviewCardMeta: { flex: 1, minWidth: 0 },
  reviewAuthor: { fontWeight: '600', color: '#111' },
  reviewDate: { fontSize: 12, color: '#6b7280' },
  reviewCardRight: { alignItems: 'flex-end' },
  starRowSmall: { flexDirection: 'row', gap: 2 },
  starSmall: { fontSize: 14, color: '#f59e0b' },
  reviewActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  reviewActionBtn: { paddingVertical: 2 },
  reviewActionEdit: { fontSize: 13, color: '#0d9488', fontWeight: '600' },
  reviewActionDelete: { fontSize: 13, color: '#c00', fontWeight: '600' },
  reviewTitle: { fontWeight: '500', color: '#111', marginBottom: 4 },
  reviewBody: { fontSize: 14, color: '#6b7280' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  footerBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  footerBtnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0d9488',
    alignItems: 'center',
  },
  footerBtnPrimaryText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  footerIconBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerIconText: { fontSize: 12, color: '#374151' },
  checkedInBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  checkedInText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
  },
  checkedInCtaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 999,
    minWidth: 200,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  checkedInCtaText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#059669',
  },
});

const mosqueStyles = StyleSheet.create({
  hero: { height: 420, position: 'relative', backgroundColor: tokens.colors.softBlue, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  heroPlaceholderIcon: { fontSize: 64 },
  heroOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%', backgroundColor: 'rgba(0,0,0,0.5)' },
  heroTopBar: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, zIndex: 2 },
  heroCircleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroCircleBtnText: { color: '#fff', fontSize: 20 },
  heroTopRight: { flexDirection: 'row', gap: 12 },
  heroBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 24, zIndex: 2 },
  heroBadges: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  openNowBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(16, 185, 129, 0.9)', alignSelf: 'flex-start' },
  openNowText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  distanceBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignSelf: 'flex-start' },
  distanceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '500' },
  heroName: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 4 },
  heroAddress: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '300' },
  body: { paddingHorizontal: 24, paddingTop: 24, marginTop: -24, backgroundColor: tokens.colors.backgroundLight },
  section: { marginBottom: 24, backgroundColor: tokens.colors.surface, padding: 24, borderRadius: 24, ...tokens.shadow.subtle },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: tokens.colors.textMain, marginBottom: 16 },
  description: { fontSize: 15, color: tokens.colors.textSecondary, lineHeight: 24 },
  readFullStory: { marginTop: 12, fontSize: 12, fontWeight: '700', color: tokens.colors.primary, textTransform: 'uppercase' },
  prayerRow: { flexDirection: 'row', gap: 16, paddingVertical: 8 },
  prayerItem: { minWidth: 56, alignItems: 'center' },
  prayerLabel: { fontSize: 10, fontWeight: '700', color: tokens.colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  prayerTime: { fontSize: 14, fontWeight: '600', color: tokens.colors.textMain },
  facilitiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  facilityCard: { width: '47%', padding: 20, borderRadius: 16, backgroundColor: tokens.colors.blueTint, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.2)' },
  facilityLabel: { fontSize: 10, fontWeight: '700', color: tokens.colors.primaryDark, opacity: 0.7, textTransform: 'uppercase', marginBottom: 4 },
  facilityValue: { fontSize: 18, fontWeight: '700', color: tokens.colors.primaryDark },
  whatPeopleSay: { fontSize: 12, color: tokens.colors.textMuted, marginBottom: 8 },
  reviewMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  reviewMetaText: { fontSize: 14, fontWeight: '700', color: tokens.colors.textMain },
  reviewMetaMuted: { fontSize: 12, color: tokens.colors.textMuted },
});

const variantStyles = StyleSheet.create({
  hero: { height: 420, position: 'relative', backgroundColor: tokens.colors.softBlue, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' },
  heroTall: { height: 380, position: 'relative', backgroundColor: tokens.colors.softBlue, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  heroPlaceholderIcon: { fontSize: 64 },
  heroOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', backgroundColor: 'rgba(0,0,0,0.5)' },
  heroTopBar: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, zIndex: 2 },
  heroCircleBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  heroCircleBtnText: { color: '#fff', fontSize: 20 },
  heroTopRight: { flexDirection: 'row', gap: 12 },
  heroBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 24, zIndex: 2 },
  heroBadgeRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  typeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  typeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  ratingBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.3)' },
  ratingBadgeText: { color: '#F3EAC2', fontSize: 14, fontWeight: '600' },
  openBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(34, 197, 94, 0.8)' },
  openBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  heroNameLarge: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 4 },
  heroAddress: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '300' },
  body: { paddingHorizontal: 24, paddingTop: 24, marginTop: -24, backgroundColor: tokens.colors.surface },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 24, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: tokens.colors.inputBorder },
  infoCell: { flex: 1, alignItems: 'center' },
  infoLabel: { fontSize: 10, color: tokens.colors.textMuted, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  infoValue: { fontSize: 14, fontWeight: '600', color: tokens.colors.textMain },
  infoDivider: { width: 1, height: 32, backgroundColor: tokens.colors.inputBorder },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 24, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: tokens.colors.inputBorder },
  statCell: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: tokens.colors.textMain },
  statLabel: { fontSize: 12, color: tokens.colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: tokens.colors.inputBorder },
  section: { marginBottom: 24, paddingHorizontal: 24, paddingTop: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: tokens.colors.textMain, marginBottom: 12 },
  description: { fontSize: 15, color: tokens.colors.textSecondary, lineHeight: 24 },
  readMore: { marginTop: 8, fontSize: 12, fontWeight: '600', color: tokens.colors.primary },
  deitiesRow: { flexDirection: 'row', gap: 24, paddingVertical: 16 },
  deityItem: { alignItems: 'center', minWidth: 100 },
  deityCircle: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: 'rgba(197, 160, 89, 0.3)', backgroundColor: tokens.colors.surface, overflow: 'hidden', marginBottom: 8, alignItems: 'center', justifyContent: 'center' },
  deityImage: { width: '100%', height: '100%' },
  deityPlaceholder: { fontSize: 40 },
  deityName: { fontSize: 14, fontWeight: '600', color: tokens.colors.textMain },
  deitySubtitle: { fontSize: 10, color: tokens.colors.textMuted, textTransform: 'uppercase' },
  facilitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  facilityCard: { width: '47%', padding: 16, borderRadius: 16, backgroundColor: tokens.colors.surface, borderWidth: 1, borderColor: tokens.colors.inputBorder },
  facilityLabel: { fontSize: 10, fontWeight: '700', color: tokens.colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  facilityValue: { fontSize: 14, fontWeight: '600', color: tokens.colors.textMain },
  facilityNotes: { fontSize: 12, color: tokens.colors.textMuted, marginTop: 4 },
  dressCard: { width: '100%' },
  actionRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, marginBottom: 24 },
  actionBtnPrimary: { flex: 1, paddingVertical: 16, paddingHorizontal: 24, borderRadius: 16, backgroundColor: tokens.colors.blueTint, alignItems: 'center', justifyContent: 'center' },
  actionBtnPrimaryText: { fontSize: 14, fontWeight: '600', color: tokens.colors.primary },
  actionBtnSecondary: { flex: 1, paddingVertical: 16, paddingHorizontal: 24, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  actionBtnSecondaryText: { fontSize: 14, fontWeight: '600', color: tokens.colors.textSecondary },
  serviceList: { borderWidth: 1, borderColor: tokens.colors.inputBorder, borderRadius: 16, overflow: 'hidden' },
  serviceRow: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: tokens.colors.inputBorder, alignItems: 'center' },
  serviceDay: { width: '30%', fontSize: 14, color: tokens.colors.textMuted, fontWeight: '500' },
  serviceName: { flex: 1, fontSize: 14, fontWeight: '600', color: tokens.colors.textMain },
  serviceTime: { fontSize: 16, fontWeight: '600', color: tokens.colors.textMain },
  ctaFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 12, backgroundColor: tokens.colors.surface, alignItems: 'center' },
  ctaButton: { backgroundColor: tokens.colors.primary, paddingVertical: 16, paddingHorizontal: 32, borderRadius: 999, minWidth: 200, alignItems: 'center' },
  ctaButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
