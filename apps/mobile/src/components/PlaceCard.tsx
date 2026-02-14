import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../app/navigation';
import type { Place } from '../lib/types';
import { tokens } from '../lib/theme';

interface PlaceCardProps {
  place: Place;
  compact?: boolean;
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function PlaceCard({ place, compact = false }: PlaceCardProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>>();
  const imageUrl = place.image_urls?.[0] ?? '';
  const rating = place.average_rating;
  const reviewCount = place.review_count ?? 0;
  const showOpenNow = place.is_open_now === true;

  if (compact) {
    return (
      <TouchableOpacity
        style={styles.compactCard}
        onPress={() => navigation.navigate('PlaceDetail', { placeCode: place.place_code })}
        activeOpacity={0.88}
      >
        <View style={styles.compactImageWrap}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.compactImage} resizeMode="cover" />
          ) : (
            <View style={styles.compactImagePlaceholder}>
              <Text style={styles.compactPlaceholderIcon}>⊕</Text>
            </View>
          )}
        </View>
        <View style={styles.compactBody}>
          <Text style={styles.compactName} numberOfLines={1}>{place.name}</Text>
          <Text style={styles.compactAddress} numberOfLines={2}>
            {place.address || place.place_type || ''}
          </Text>
          <View style={styles.compactChips}>
            {place.place_type ? (
              <View style={styles.chipType}>
                <Text style={styles.chipTypeText}>{place.place_type}</Text>
              </View>
            ) : null}
            {place.distance != null && (
              <View style={styles.chipDist}>
                <Text style={styles.chipDistText}>{formatDistance(place.distance)}</Text>
              </View>
            )}
            {rating != null && (
              <View style={styles.chipRating}>
                <Text style={styles.chipRatingText}>★ {rating.toFixed(1)}{reviewCount > 0 ? ` (${reviewCount})` : ''}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('PlaceDetail', { placeCode: place.place_code })}
      activeOpacity={0.9}
    >
      <View style={styles.imageWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderIcon}>⊕</Text>
          </View>
        )}
        <View style={styles.badges}>
          {showOpenNow && (
            <View style={styles.openNowBadge}>
              <View style={styles.openNowDot} />
              <Text style={styles.openNowText}>Open Now</Text>
            </View>
          )}
          {place.user_has_checked_in && (
            <View style={styles.visitedBadge}>
              <Text style={styles.visitedText}>✓ Visited</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{place.name}</Text>
        <Text style={styles.address} numberOfLines={1}>{place.address || place.place_type}</Text>
        <View style={styles.footer}>
          {place.distance != null && (
            <Text style={styles.distance}>{formatDistance(place.distance)}</Text>
          )}
          {rating != null && (
            <View style={styles.ratingRow}>
              <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text>
              {reviewCount > 0 && (
                <Text style={styles.reviewCount}> ({reviewCount})</Text>
              )}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  compactCard: {
    flexDirection: 'row',
    height: 128,
    backgroundColor: tokens.colors.surface,
    borderRadius: 24,
    padding: 16,
    gap: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    ...tokens.shadow.subtle,
  },
  compactImageWrap: {
    width: 96,
    height: 96,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: tokens.colors.softBlue,
    flexShrink: 0,
  },
  compactImage: { width: '100%', height: '100%' },
  compactImagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  compactPlaceholderIcon: { fontSize: 32, color: tokens.colors.textMuted },
  compactBody: { flex: 1, flexDirection: 'column', justifyContent: 'center', paddingVertical: 4 },
  compactName: {
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.textMain,
    marginBottom: 4,
  },
  compactAddress: {
    fontSize: 12,
    color: tokens.colors.textMuted,
    fontWeight: '300',
    marginBottom: 8,
  },
  compactChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipType: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  chipTypeText: { fontSize: 10, fontWeight: '500', color: tokens.colors.primaryDark },
  chipDist: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: tokens.colors.softBlue,
  },
  chipDistText: { fontSize: 10, fontWeight: '500', color: tokens.colors.textSecondary },
  chipRating: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#fffbeb',
  },
  chipRatingText: { fontSize: 10, fontWeight: '500', color: '#92400e' },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.borderRadius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    ...tokens.shadow.card,
  },
  imageWrap: {
    height: 160,
    backgroundColor: tokens.colors.softBlue,
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholderIcon: { fontSize: 40, color: tokens.colors.textMuted },
  badges: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  openNowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.colors.openNowBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  openNowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.openNow,
  },
  openNowText: {
    color: tokens.colors.openNow,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  visitedBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  visitedText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  body: { padding: 16 },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: tokens.colors.textMain,
    marginBottom: 4,
  },
  address: {
    fontSize: 14,
    color: tokens.colors.textSecondary,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.inputBorder,
  },
  distance: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
    fontWeight: '500',
  },
  ratingRow: { flexDirection: 'row', alignItems: 'baseline' },
  ratingValue: { fontSize: 14, fontWeight: '600', color: tokens.colors.textMain },
  reviewCount: { fontSize: 12, color: tokens.colors.textMuted },
});
