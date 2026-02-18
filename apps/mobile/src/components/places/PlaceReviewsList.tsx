import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { deleteReview } from '@/lib/api/client';
import { useI18n } from '@/app/providers';
import { tokens } from '@/lib/theme';
import { getFullImageUrl } from '@/lib/utils/imageUtils';
import type { Review } from '@/lib/types';
import type { RootStackParamList } from '@/app/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>;

interface Props {
  placeCode: string;
  reviews: Review[];
  userCode?: string;
  averageRating?: number;
  reviewCount?: number;
  onRefresh: () => void;
}

function PlaceReviewsList({
  placeCode,
  reviews,
  userCode,
  averageRating,
  reviewCount,
  onRefresh,
}: Props) {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  const userReview = userCode ? reviews.find((r) => r.user_code === userCode) : null;

  const handleDeleteReview = (reviewCode: string) => {
    Alert.alert(t('reviews.deleteTitle'), t('reviews.deleteWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setDeletingCode(reviewCode);
          try {
            await deleteReview(reviewCode);
            onRefresh();
          } catch {
            // ignore
          } finally {
            setDeletingCode(null);
          }
        },
      },
    ]);
  };

  return (
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
          onPress={() =>
            navigation.navigate('WriteReview', {
              placeCode,
              reviewCode: userReview.review_code,
              rating: userReview.rating,
              title: userReview.title ?? '',
              body: userReview.body ?? '',
            })
          }
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
                  {userCode && r.user_code === userCode && (
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
              {(r.images && r.images.length > 0) || (r.photo_urls && r.photo_urls.length > 0) ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.reviewPhotos}
                  contentContainerStyle={styles.reviewPhotosContent}
                >
                  {r.images?.map((img, i) => (
                    <ExpoImage
                      key={`img-${i}`}
                      source={{ uri: getFullImageUrl(img.url) }}
                      style={styles.reviewPhoto}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                  ))}
                  {r.photo_urls?.map((url: string, i: number) => (
                    <ExpoImage
                      key={`photo-${i}`}
                      source={{ uri: url }}
                      style={styles.reviewPhoto}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                  ))}
                </ScrollView>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default React.memo(PlaceReviewsList);

const styles = StyleSheet.create({
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
  muted: { fontSize: 14, color: tokens.colors.textMuted },
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
});
