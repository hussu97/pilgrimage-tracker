import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation';
import type { Place } from '@/lib/types';
import { tokens } from '@/lib/theme';
import { getFullImageUrl } from '@/lib/utils/imageUtils';

interface PlaceCardProps {
  place: Place;
  compact?: boolean;
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function PlaceCard({ place, compact = false }: PlaceCardProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'PlaceDetail'>>();
  const imageUrl = getFullImageUrl(place.images?.[0]?.url);
  const rating = place.average_rating;
  const reviewCount = place.review_count ?? 0;
  const isOpen = place.is_open_now === true;
  const isClosed = place.is_open_now === false;

  if (compact) {
    return (
      <TouchableOpacity
        style={styles.compactCard}
        onPress={() => navigation.navigate('PlaceDetail', { placeCode: place.place_code })}
        activeOpacity={0.88}
      >
        <View style={styles.compactImageWrap}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.compactImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
          ) : (
            <View style={styles.compactImagePlaceholder}>
              <MaterialIcons name="location-on" size={32} color={tokens.colors.textMuted} />
            </View>
          )}
        </View>
        <View style={styles.compactBody}>
          <Text style={styles.compactName} numberOfLines={1}>{place.name}</Text>
          <Text style={styles.compactAddress} numberOfLines={2}>
            {place.address || place.place_type || ''}
          </Text>
          <View style={styles.compactChips}>
            {isOpen && (
              <View style={styles.chipOpen}>
                <Text style={styles.chipOpenText}>Open</Text>
              </View>
            )}
            {isClosed && (
              <View style={styles.chipClosed}>
                <Text style={styles.chipClosedText}>Closed</Text>
              </View>
            )}
            {place.distance != null && (
              <View style={styles.chipDist}>
                <Text style={styles.chipDistText}>{formatDistance(place.distance)}</Text>
              </View>
            )}
            {rating != null && (
              <View style={styles.chipRating}>
                <MaterialIcons name="star" size={9} color="#92400e" />
                <Text style={styles.chipRatingText}>
                  {rating.toFixed(1)}{reviewCount > 0 ? ` (${reviewCount})` : ''}
                </Text>
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
      {/* Background image */}
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.imageFallback]}>
          <MaterialIcons name="location-on" size={48} color="rgba(255,255,255,0.4)" />
        </View>
      )}

      {/* Hero gradient: top fade (black/40) + bottom fade (black/80) */}
      <View style={styles.overlayTop} pointerEvents="none" />
      <View style={styles.overlayBottom} pointerEvents="none" />

      {/* Top badges */}
      <View style={styles.topBadges}>
        <View style={styles.topBadgesLeft}>
          {isOpen && (
            <View style={styles.badgeOpen}>
              <View style={styles.openDot} />
              <Text style={styles.badgeText}>Open</Text>
            </View>
          )}
          {isClosed && (
            <View style={styles.badgeClosed}>
              <Text style={styles.badgeText}>Closed</Text>
            </View>
          )}
        </View>
        {place.user_has_checked_in && (
          <View style={styles.badgeVisited}>
            <MaterialIcons name="check" size={11} color="#fff" />
            <Text style={styles.badgeText}>Visited</Text>
          </View>
        )}
      </View>

      {/* Bottom glass info panel */}
      <View style={styles.glassPanel}>
        <Text style={styles.cardName} numberOfLines={1}>{place.name}</Text>
        <View style={styles.locationRow}>
          <MaterialIcons name="location-on" size={12} color="rgba(255,255,255,0.75)" />
          <Text style={styles.locationText} numberOfLines={1}>
            {place.address || place.place_type || ''}
          </Text>
        </View>
        <View style={styles.glassDivider} />
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            {place.distance != null && (
              <Text style={styles.distanceText}>{formatDistance(place.distance)}</Text>
            )}
            {rating != null && (
              <View style={styles.ratingPill}>
                <MaterialIcons name="star" size={10} color="#facc15" />
                <Text style={styles.ratingText}>
                  {rating.toFixed(1)}{reviewCount > 0 ? ` (${formatCount(reviewCount)})` : ''}
                </Text>
              </View>
            )}
          </View>
          {!place.user_has_checked_in && (
            <TouchableOpacity
              style={styles.checkInBtn}
              onPress={() => navigation.navigate('PlaceDetail', { placeCode: place.place_code })}
              activeOpacity={0.85}
            >
              <Text style={styles.checkInText}>Check In</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(PlaceCard);

const styles = StyleSheet.create({
  // ── Compact (map scroller) ──────────────────────────────────────────────
  compactCard: {
    flexDirection: 'row',
    height: 128,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.borderRadius['2xl'], // 16px
    padding: 16,
    gap: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.inputBorder,
    ...tokens.shadow.card,
  },
  compactImageWrap: {
    width: 96,
    height: 96,
    borderRadius: tokens.borderRadius.xl, // 12px – inner element
    overflow: 'hidden',
    backgroundColor: tokens.colors.softBlue,
    flexShrink: 0,
  },
  compactImage: { width: '100%', height: '100%' },
  compactImagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  // Open badge – primary blue pill
  chipOpen: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.borderRadius.full,
    backgroundColor: tokens.colors.openNow,
  },
  chipOpenText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  // Closed badge – red pill
  chipClosed: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.borderRadius.full,
    backgroundColor: tokens.colors.closedNow,
  },
  chipClosedText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  chipDist: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: tokens.colors.softBlue,
  },
  chipDistText: { fontSize: 10, fontWeight: '500', color: tokens.colors.textSecondary },
  chipRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#fffbeb',
  },
  chipRatingText: { fontSize: 10, fontWeight: '500', color: '#92400e' },

  // ── Regular (list view) ─────────────────────────────────────────────────
  card: {
    height: 280,
    borderRadius: tokens.borderRadius['3xl'], // 24px – large card outer
    overflow: 'hidden',
    ...tokens.shadow.card,
  },
  imageFallback: {
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Top fade: matches design ref from-black/40 (top)
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: 'rgba(0,0,0,0.40)',
  },
  // Bottom fade: matches design ref to-black/80 (bottom)
  overlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  topBadges: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBadgesLeft: {
    flexDirection: 'row',
    gap: 6,
  },
  // Open badge – primary blue, solid (matches design reference)
  badgeOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: tokens.colors.openNow,
    borderWidth: 1,
    borderColor: 'rgba(0,122,255,0.50)',
    borderRadius: tokens.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  // Closed badge – red
  badgeClosed: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.closedNow,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.50)',
    borderRadius: tokens.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  // Visited badge – glass morphism
  badgeVisited: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: tokens.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  // Glass panel – semi-transparent with subtle border
  glassPanel: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: tokens.borderRadius['2xl'], // 16px
    padding: 14,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 3,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
    flex: 1,
  },
  glassDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.20)',
    marginVertical: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  distanceText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: tokens.borderRadius.full,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  checkInBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: tokens.borderRadius.full,
    marginLeft: 8,
    flexShrink: 0,
  },
  checkInText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
