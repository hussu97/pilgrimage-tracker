import { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getPlace,
  getPlaceReviews,
  addFavorite,
  removeFavorite,
  deleteReview,
} from '../../lib/api/client';
import { shareUrl } from '../../lib/share';
import { useAuth } from '../providers';
import { useI18n } from '../providers';
import type { RootStackParamList } from '../navigation';
import type { PlaceDetail as PlaceDetailType, Review } from '../../lib/types';

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

  const directionsUrl = place
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.lat + ',' + place.lng)}`
    : '';

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

  const heroImage = place.image_urls?.[0];

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
              <Text style={styles.heroPlaceholderIcon}>◉</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.backButtonHero, { top: insets.top + 8 }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.backArrow}>←</Text>
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
          onPress={() => directionsUrl && Linking.openURL(directionsUrl)}
          activeOpacity={0.8}
        >
          <Text style={styles.footerBtnText}>Directions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.footerBtnPrimary}
          onPress={() => navigation.navigate('CheckIn', { placeCode })}
          activeOpacity={0.8}
        >
          <Text style={styles.footerBtnPrimaryText}>{t('places.checkIn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.footerIconBtn}
          onPress={() => shareUrl(place.name, `places/${placeCode}`)}
          activeOpacity={0.8}
        >
          <Text style={styles.footerIconText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.footerIconBtn}
          onPress={toggleFavorite}
          disabled={favoriteLoading}
          activeOpacity={0.8}
        >
          <Text style={styles.footerIconText}>{place.is_favorite ? '♥' : '♡'}</Text>
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
});
